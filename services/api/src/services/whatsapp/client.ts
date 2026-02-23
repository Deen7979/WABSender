import { config } from "../../config/index.js";

const baseUrl = `https://graph.facebook.com/${config.graphApiVersion}`;

const buildHeaders = (accessToken: string) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${accessToken}`
});

export const whatsappGet = async <T>(path: string, accessToken: string): Promise<T> => {
  const response = await fetch(`${baseUrl}${path}`, { headers: buildHeaders(accessToken) });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WhatsApp API error: ${response.status} ${text}`);
  }
  return (await response.json()) as T;
};

export const whatsappPost = async <T>(path: string, body: unknown, accessToken: string): Promise<T> => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: buildHeaders(accessToken),
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WhatsApp API error: ${response.status} ${text}`);
  }
  return (await response.json()) as T;
};
