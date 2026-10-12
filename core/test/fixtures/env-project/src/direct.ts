// Direct member access and destructuring
export const port = process.env.PORT;
const { API_SECRET } = process.env;
console.log(`Port ${port}, Secret loaded: ${Boolean(API_SECRET)}`);
