import React, { useEffect, useState } from "react";

type Props = {
  apiClient: any;
  brandId: string;
};

export const BrandWhatsAppSetupPage: React.FC<Props> = ({ apiClient, brandId }) => {
  const [status, setStatus] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setLoading(true);
      setError(null);
      const [s, h] = await Promise.all([
        apiClient.getBrandWhatsAppStatus(brandId),
        apiClient.getBrandWebhookHealth(brandId),
      ]);
      setStatus(s);
      setHealth(h);
    } catch (err: any) {
      setError(err?.message || "Failed to load WhatsApp setup");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [brandId]);

  return (
    <div className="settings-container">
      <h2>Brand WhatsApp Setup</h2>
      {!status?.connected && <div className="warning-banner">Not Connected</div>}
      {error && <div className="error-banner">{error}</div>}
      {loading && <div>Loading...</div>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button onClick={async () => {
          const response = await apiClient.initBrandWhatsApp(brandId) as { authUrl: string };
          window.location.href = response.authUrl;
        }}>WhatsApp Setup</button>
        <button onClick={refresh}>Refresh Status</button>
        <button onClick={async () => {
          await apiClient.syncBrandTemplates(brandId);
          refresh();
        }}>Sync Templates</button>
        <button onClick={async () => {
          await apiClient.disconnectBrandWhatsApp(brandId);
          refresh();
        }}>Disconnect</button>
      </div>

      <pre style={{ background: "#f7f7f7", padding: 12, borderRadius: 6 }}>
        {JSON.stringify({ status, health }, null, 2)}
      </pre>
    </div>
  );
};
