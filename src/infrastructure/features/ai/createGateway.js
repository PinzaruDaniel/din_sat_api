export function createGateway({ endpoint, token, model }) {
  return {
    async complete({ messages, tools, signal }) {
      const response = await fetch(endpoint, {
        method: 'POST',
        redirect: 'error',
        signal,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          ...(tools ? { tools } : { response_format: { type: 'json_object' } }),
          max_tokens: 750,
        }),
      });
      if (!response.ok) throw new Error('AI gateway request failed');
      const result = await response.json();
      const message = result?.choices?.[0]?.message;
      if (!message) throw new Error('AI gateway response was invalid');
      return message;
    },
  };
}
