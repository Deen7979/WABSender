# Reply Bot Engine

Trigger types:

- EXACT_MATCH
- CONTAINS
- WELCOME

Table:

reply_bots:
id
brand_id
trigger_type
keyword
response_type
response_payload
status

Inbound flow:

Message →
Check bot →
If matched →
Send response →
Log message
