export const imagePath = '/api/v1/product-images/';
const uploadPath =
  /^\/api\/v1\/product-images\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/;

export function uploadedImageId(value) {
  return uploadPath.exec(value)?.[1];
}
