<?php
/**
 * send-cds-contact.php — DEPRECATED
 *
 * This endpoint has been replaced by the Supabase Edge Function
 * `contact-form-submit` which writes to the CRM database first.
 *
 * This file returns a deprecation notice to prevent any path
 * that sends email without saving to the CRM.
 */
header('Content-Type: application/json');
http_response_code(410);
echo json_encode([
  'ok' => false,
  'error' => 'This endpoint has been retired. Contact form submissions are now handled by the CRM system.',
]);
