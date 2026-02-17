// Basic integration test for conversation reply endpoint
// This is a manual test to verify the implementation works

import { sendMessage } from "../src/services/messageService.js";

async function testSendMessage() {
  console.log("Testing sendMessage function...");

  // Mock parameters - in real test, these would be set up properly
  const params = {
    orgId: "test-org",
    contactId: "test-contact",
    conversationId: "test-conversation",
    phoneNumberId: "test-phone-id",
    recipientPhoneE164: "+1234567890",
    messageBody: "Test message",
    retentionPolicy: "manual_reply",
  };

  try {
    const result = await sendMessage(params);
    console.log("sendMessage result:", result);

    if (result.success) {
      console.log("✅ Message sent successfully");
    } else {
      console.log("❌ Message send failed:", result.error);
    }
  } catch (error) {
    console.error("❌ Test failed with error:", error);
  }
}

// Run the test
testSendMessage().catch(console.error);