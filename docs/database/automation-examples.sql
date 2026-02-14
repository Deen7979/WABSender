-- Example Automation Rules for Testing Phase 3.4
-- These can be inserted into automation_rules table for testing

-- Example 1: Welcome message for "hello", "hi", "hey"
-- Priority: 10 (high priority)
-- Action: Send template
INSERT INTO automation_rules (
  org_id,
  name,
  description,
  trigger_type,
  trigger_config,
  action_type,
  action_config,
  priority,
  is_active
) VALUES (
  '00000000-0000-0000-0000-000000000001', -- Replace with actual org_id
  'Welcome New Contacts',
  'Send welcome template when contact says hello/hi/hey',
  'keyword',
  '{"keywords": ["hello", "hi", "hey"]}',
  'send_template',
  '{
    "template_name": "welcome_message",
    "template_language": "en",
    "template_params": []
  }',
  10,
  true
);

-- Example 2: Support auto-reply for "support", "help", "assist"
-- Priority: 20 (medium priority)
-- Action: Send text message
INSERT INTO automation_rules (
  org_id,
  name,
  description,
  trigger_type,
  trigger_config,
  action_type,
  action_config,
  priority,
  is_active
) VALUES (
  '00000000-0000-0000-0000-000000000001', -- Replace with actual org_id
  'Support Auto-Reply',
  'Send support message when contact asks for help',
  'keyword',
  '{"keywords": ["support", "help", "assist"]}',
  'send_text',
  '{
    "message": "Thank you for contacting support. An agent will respond within 1 hour."
  }',
  20,
  true
);

-- Example 3: Hours auto-reply for "hours", "open", "schedule"
-- Priority: 30 (lower priority)
-- Action: Send text message
INSERT INTO automation_rules (
  org_id,
  name,
  description,
  trigger_type,
  trigger_config,
  action_type,
  action_config,
  priority,
  is_active
) VALUES (
  '00000000-0000-0000-0000-000000000001', -- Replace with actual org_id
  'Business Hours Info',
  'Send business hours when contact asks about schedule',
  'keyword',
  '{"keywords": ["hours", "open", "schedule", "timing"]}',
  'send_text',
  '{
    "message": "We are open Monday-Friday 9am-5pm EST. Visit our website for more info."
  }',
  30,
  true
);

-- Example 4: Priority test - Higher priority greeting
-- Priority: 5 (highest priority - should win over Example 1)
-- Action: Send text message
INSERT INTO automation_rules (
  org_id,
  name,
  description,
  trigger_type,
  trigger_config,
  action_type,
  action_config,
  priority,
  is_active
) VALUES (
  '00000000-0000-0000-0000-000000000001', -- Replace with actual org_id
  'VIP Greeting (High Priority)',
  'High priority greeting response',
  'keyword',
  '{"keywords": ["hello"]}',
  'send_text',
  '{
    "message": "Welcome VIP! How can we assist you today?"
  }',
  5,
  true
);

-- Testing Notes:
-- 1. Replace org_id with actual org UUID from your database
-- 2. For send_template actions, ensure template_name exists in templates table
-- 3. Test priority by having multiple rules match same keyword
-- 4. Test rate limiting by sending multiple messages within 1 hour
-- 5. Check automation_logs table after each test to verify logging

-- Query to check automation logs:
-- SELECT 
--   ar.name,
--   al.action_taken,
--   al.result,
--   al.error_message,
--   al.triggered_at
-- FROM automation_logs al
-- JOIN automation_rules ar ON ar.id = al.automation_rule_id
-- ORDER BY al.triggered_at DESC
-- LIMIT 20;
