# Multi-Tenant + Multi-Brand Model

Current:
User → Org

Upgrade:
User → Org → Brand → WhatsApp Number

Add new table:

brands:
id
org_id
name
whatsapp_number
phone_number_id
status

All:
messages
campaigns
contacts
templates

Must include brand_id.
