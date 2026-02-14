import { config } from "../../config/index.js";

const baseUrl = `https://graph.facebook.com/${config.graphApiVersion}`;

const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${config.whatsappToken}`
};

export const whatsappGet = async <T>(path: string): Promise<T> => {
  const response = await fetch(`${baseUrl}${path}`, { headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WhatsApp API error: ${response.status} ${text}`);
  }
  return (await response.json()) as T;
};

export const whatsappPost = async <T>(path: string, body: unknown): Promise<T> => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WhatsApp API error: ${response.status} ${text}`);
  }
  return (await response.json()) as T;
};
