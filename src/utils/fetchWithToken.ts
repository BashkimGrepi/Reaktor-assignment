import "dotenv/config";

// calls to legacy api with token in header

interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
}

if (!process.env.BEARER_TOKEN) throw new Error("BEARER_TOKEN is not set");
const token = process.env.BEARER_TOKEN;

export const fetchWithToken = async (
  url: string,
  options: FetchOptions = {},
): Promise<Response> => {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      //Authorization: `Bearer ${process.env.BEARER_TOKEN}`,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

  return response;
};
