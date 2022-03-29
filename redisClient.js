import { createClient } from 'redis';

export async function redisClient() {
  const REDIS_HOST = process.env.REDIS_HOST || 'redis';
  const REDIS_PORT = process.env.REDIS_PORT || 6379;

  const client = createClient({
    url: `redis://${REDIS_HOST}:${REDIS_PORT}`
  });
  client.on('error', (err) => console.log('Redis Client Error', err));
  await client.connect();
  return client;
}
