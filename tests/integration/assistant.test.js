import assert from 'node:assert/strict';
import { test } from 'node:test';
import request from 'supertest';
import { createApp } from '../../src/app/createApp.js';
import { createServices } from '../../src/app/container/createServices.js';
import { createAssistantService } from '../../src/application/features/ai/assistantService.js';
import { createCatalogTools } from '../../src/application/features/ai/catalogTools.js';
import { createDemoDatabase } from '../../src/infrastructure/persistence/connections/createDemoDatabase.js';
import { createPasswords } from '../../src/infrastructure/security/passwords.js';
import { AppError } from '../../src/shared/errors/AppError.js';

const origin = 'http://localhost:5173';
const path = '/api/v1/ai';
const searchCall = {
  id: 'search-1',
  type: 'function',
  function: { name: 'search_products', arguments: '{"category":"legume"}' },
};

function provider(productId = 'product-1') {
  return {
    async complete({ tools, messages, signal }) {
      assert.ok(signal instanceof AbortSignal);
      if (tools) return { tool_calls: [searchCall] };
      assert.match(messages.at(-1).content, /product-1/);
      assert.doesNotMatch(messages.at(-1).content, /description|passwordHash/);
      return {
        content: JSON.stringify({ items: [{ productId, quantity: 2 }] }),
      };
    },
  };
}

async function register(app, email, role = 'buyer') {
  const agent = request.agent(app);
  const { body } = await agent.get('/api/v1/auth/session').expect(200);
  const { body: session } = await agent
    .post('/api/v1/auth/register')
    .set('Origin', origin)
    .set('X-CSRF-Token', body.csrfToken)
    .send({
      email,
      role,
      name: 'Asistent test',
      password: 'assistant-test-password',
    })
    .expect(201);
  return {
    post: (route) =>
      agent
        .post(path + route)
        .set('Origin', origin)
        .set('X-CSRF-Token', session.csrfToken),
    agent,
  };
}

test('assistant only proposes catalog items, enforces ownership and never creates orders', async () => {
  const repositories = createDemoDatabase();
  const passwords = await createPasswords();
  const services = createServices({
    repositories,
    passwords,
    gateway: provider(),
  });
  const app = createApp({
    services,
    config: {
      demo: true,
      origin,
      sessionSecret: 'test-session-secret-for-shopping-assistant',
    },
  });
  const buyer = await register(app, 'assistant-buyer@dinsat.test');
  const other = await register(app, 'assistant-other@dinsat.test');
  const producer = await register(
    app,
    'assistant-producer@dinsat.test',
    'producer',
  );
  await producer.post('/chat').send({ message: 'roșii' }).expect(403);
  await buyer.post('/chat').send({ message: 'roșii', price: 1 }).expect(400);
  const {
    body: { proposal },
  } = await buyer.post('/chat').send({ message: 'roșii' }).expect(200);
  const product = await services.catalog.details('product-1');
  assert.equal(proposal.items[0].product.id, product.id);
  assert.equal(proposal.items[0].quantity, 2);
  assert.equal(Number(proposal.totalAmount), 2 * Number(product.priceAmount));
  const confirm = `/cart-proposals/${proposal.id}/confirm`;
  await other.post(confirm).expect(404);
  const { body } = await buyer.post(confirm).expect(200);
  assert.deepEqual(body.items, proposal.items);
  assert.equal(body.totalAmount, proposal.totalAmount);
  const orders = await buyer.agent.get('/api/v1/orders').expect(200);
  assert.deepEqual(orders.body.items, []);
  for (let count = 0; count < 5; count++)
    await buyer.post('/chat').send({ message: 'roșii' }).expect(200);
  await buyer.post('/chat').send({ message: 'roșii' }).expect(429);
});

test('assistant discards hallucinated IDs, rechecks price and stock, and expires proposals', async () => {
  let priceAmount = '15.20';
  let stock = 4;
  let timestamp = Date.now();
  const product = () => ({
    id: 'product-1',
    producerId: 'producer-1',
    priceAmount,
    availableQuantity: stock,
  });
  const catalog = {
    list: async () => ({ items: [product()] }),
    details: async () => product(),
  };
  const pickup = { list: async () => [] };
  const now = () => timestamp;
  const input = { message: 'roșii', previous: [] };
  const hallucinating = createAssistantService({
    catalog,
    pickup,
    gateway: provider('unknown'),
    now,
  });
  assert.equal((await hallucinating.chat('buyer', input)).proposal, null);
  const service = createAssistantService({
    catalog,
    pickup,
    gateway: provider(),
    now,
  });
  const { proposal } = await service.chat('buyer', input);
  assert.equal(proposal.totalAmount, '30.40');
  stock = 1;
  await assert.rejects(service.confirm('buyer', proposal.id), {
    code: 'PROPOSAL_CHANGED',
  });
  stock = 4;
  priceAmount = '15.21';
  await assert.rejects(service.confirm('buyer', proposal.id), {
    code: 'PROPOSAL_CHANGED',
  });
  priceAmount = '15.20';
  timestamp += 600_000;
  await assert.rejects(service.confirm('buyer', proposal.id), {
    code: 'PROPOSAL_NOT_FOUND',
  });
  const timeout = createAssistantService({
    catalog,
    pickup,
    gateway: {
      complete: async () => {
        throw new DOMException('provider secret', 'TimeoutError');
      },
    },
  });
  await assert.rejects(timeout.chat('buyer', input), {
    code: 'AI_UNAVAILABLE',
    status: 503,
  });
});

test('catalog tools validate exact arguments and exclude absent or exhausted products', async () => {
  const run = createCatalogTools({
    catalog: {
      list: async ({ pageSize }) => {
        assert.equal(pageSize, 12);
        return { items: [{ id: 'empty', availableQuantity: 0 }] };
      },
      details: async (id) => {
        if (id === 'empty') return { id, availableQuantity: 0 };
        throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Absent');
      },
    },
    pickup: { list: async () => [] },
  });
  assert.deepEqual(await run('raw_sql', '{}'), { error: 'INVALID_ARGUMENTS' });
  assert.deepEqual(await run('search_products', '{"buyerId":"someone"}'), {
    error: 'INVALID_ARGUMENTS',
  });
  assert.deepEqual(await run('search_products', '{}'), { products: [] });
  assert.deepEqual(await run('product_details', '{"productId":"missing"}'), {
    error: 'PRODUCT_NOT_FOUND',
  });
  assert.deepEqual(await run('product_details', '{"productId":"empty"}'), {
    error: 'OUT_OF_STOCK',
  });
  assert.deepEqual(await run('pickup_options', '{"producerId":"unknown"}'), {
    slots: [],
  });
});
