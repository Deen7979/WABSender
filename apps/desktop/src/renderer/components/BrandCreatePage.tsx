import React, { useState } from "react";
import "./BrandCreatePage.css";

type Props = {
  apiClient: any;
  onCreated: (brandId: string, brandName: string) => void;
};

export const BrandCreatePage: React.FC<Props> = ({ apiClient, onCreated }) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [notificationsEmail, setNotificationsEmail] = useState("");
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timezoneOptions = [
    "UTC",
    "Asia/Kolkata",
    "Asia/Dubai",
    "Asia/Singapore",
    "Europe/London",
    "Europe/Berlin",
    "America/New_York",
    "America/Chicago",
    "America/Los_Angeles",
    "Australia/Sydney",
  ];

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!name.trim() || !companyName.trim() || !phone.trim() || !timezone.trim()) {
      setError("Brand Name, Company Name, Phone and Timezone are required.");
      return;
    }

    if (!/^\+?[1-9]\d{6,14}$/.test(phone.trim())) {
      setError("Phone format is invalid.");
      return;
    }

    try {
      setSubmitting(true);
      const form = new FormData();
      form.append("name", name.trim());
      form.append("description", description.trim());
      form.append("companyName", companyName.trim());
      form.append("phone", phone.trim());
      form.append("timezone", timezone.trim());
      form.append("notificationsEmail", notificationsEmail.trim());
      form.append("emailNotificationsEnabled", emailNotificationsEnabled ? "true" : "false");
      if (logoFile) {
        form.append("logo", logoFile);
      }

      const created = await apiClient.createBrand(form) as { id: string; name: string };
      onCreated(created.id, created.name);
    } catch (err: any) {
      if (err?.message?.includes("BRAND_LIMIT_REACHED")) {
        setError(err.message);
      } else {
        setError(err?.message || "Failed to create brand");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="settings-container">
      <h2 className="brand-create-title">Create Brand</h2>
      {error && <div className="error-banner">{error}</div>}
      <div className="brand-create-card">
        <div className="brand-create-grid">
          <form onSubmit={handleSubmit} className="brand-create-form" noValidate>
            <div className="brand-create-row">
              <div className="brand-field">
                <label htmlFor="brand-name" className="brand-label required">Brand Name</label>
                <input
                  id="brand-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter Brand Name"
                  required
                  className="brand-input"
                />
              </div>
              <div className="brand-field">
                <label htmlFor="brand-description" className="brand-label">Brand Description</label>
                <textarea
                  id="brand-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter Brand Description"
                  rows={3}
                  className="brand-input brand-textarea"
                />
              </div>
            </div>

            <div className="brand-create-row">
              <div className="brand-field">
                <label htmlFor="brand-logo" className="brand-label">Brand Logo</label>
                <input
                  id="brand-logo"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                  className="brand-file-input"
                />
              </div>
              <div className="brand-field">
                <label htmlFor="brand-timezone" className="brand-label required">Timezone</label>
                <select
                  id="brand-timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  required
                  className="brand-input"
                >
                  <option value="" disabled>Select</option>
                  {timezoneOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="brand-create-row">
              <div className="brand-field">
                <label htmlFor="brand-company" className="brand-label required">Company Name</label>
                <input
                  id="brand-company"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Enter Company Name"
                  required
                  className="brand-input"
                />
              </div>
              <div className="brand-field">
                <label htmlFor="brand-phone" className="brand-label required">Phone</label>
                <input
                  id="brand-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+15551234567"
                  required
                  className="brand-input"
                />
              </div>
            </div>

            <div className="brand-create-row">
              <div className="brand-field">
                <label htmlFor="brand-email" className="brand-label">
                  Add Email
                  <span className="brand-label-helper">(If this field is empty then chat inbox messages is sent to default login email.)</span>
                </label>
                <input
                  id="brand-email"
                  value={notificationsEmail}
                  onChange={(e) => setNotificationsEmail(e.target.value)}
                  placeholder="example@gmail.com, example2@gmail.com"
                  className="brand-input"
                />
              </div>
              <div className="brand-field">
                <label htmlFor="brand-email-notification" className="brand-label">
                  Email Notification
                  <span className="brand-label-helper">(If you want email notification of every new message)</span>
                </label>
                <select
                  id="brand-email-notification"
                  value={emailNotificationsEnabled ? "yes" : "no"}
                  onChange={(e) => setEmailNotificationsEnabled(e.target.value === "yes")}
                  className="brand-input"
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
            </div>

            <button type="submit" disabled={submitting} className="brand-submit-btn">
              {submitting ? "Submitting..." : "Submit"}
            </button>
          </form>

          <aside className="brand-instructions">
            <h3>Create Brand Instructions</h3>
            <ul className="brand-instruction-list">
              <li className="instruction-dot-red">Enter your brand name, description &amp; logo.</li>
              <li className="instruction-dot-blue">Select your preferred time zone.</li>
              <li className="instruction-dot-yellow">Enter your company name.</li>
              <li className="instruction-dot-red">Enter your phone number in international format (+15551234567).</li>
            </ul>
          </aside>
        </div>
      </div>
    </div>
  );
};
