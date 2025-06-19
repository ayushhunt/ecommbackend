import { Product } from '../models/product';

export async function generateSKU(
  productName: string, 
  color?: string, 
  size?: string
): Promise<string> {
  // Convert product name to uppercase alphanumeric only
  const nameCode = productName
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 3);
  
  // Get color and size codes
  const colorCode = color ? color.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 2) : 'XX';
  const sizeCode = size ? size.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 2) : 'XX';
  
  // Get current date components
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  
  // Generate base SKU
  const baseSKU = `${nameCode}${colorCode}${sizeCode}${year}${month}`;
  
  // Find the latest sequential number for this base SKU
  const latestProduct = await Product.findOne(
    { 'variants.sku': new RegExp(`^${baseSKU}`) },
    { 'variants.sku': 1 },
    { sort: { 'variants.sku': -1 } }
  );
  
  let sequentialNumber = 1;
  if (latestProduct) {
    const latestSKU = latestProduct.variants
      ?.map(v => v.sku)
      .filter(sku => sku.startsWith(baseSKU))
      .sort()
      .pop();
    
    if (latestSKU) {
      const currentNumber = parseInt(latestSKU.slice(-4));
      if (!isNaN(currentNumber)) {
        sequentialNumber = currentNumber + 1;
      }
    }
  }
  
  // Create final SKU with sequential number
  return `${baseSKU}${sequentialNumber.toString().padStart(4, '0')}`;
}