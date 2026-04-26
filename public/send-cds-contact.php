<?php
/**
 * send-cds-contact.php — Cast Director Studio Contact Form
 * JSON in, JSON out
 * 1) Sends admin email to configured admin mailbox
 * 2) Sends confirmation (autoresponder) to the inquirer
 * 3) Returns JSON with ok and ticketId (CDS-YYMMDD-ABCD)
 *
 * SMTP credentials are loaded from a private config file
 * outside the public web root for security.
 */
declare(strict_types=1);
header('Content-Type: application/json');

use PHPMailer\PHPMailer\PHPMailer;

require __DIR__ . '/vendor/PHPMailer/src/PHPMailer.php';
require __DIR__ . '/vendor/PHPMailer/src/SMTP.php';
require __DIR__ . '/vendor/PHPMailer/src/Exception.php';

// ---------- Config ----------
// Load SMTP credentials from private config outside web root.
// If the file does not exist, fall back to placeholder values
// and log a warning. The endpoint will fail to send but will not
// expose credentials.
$cfgPath = __DIR__ . '/../private/cds-mail-config.php';
if (file_exists($cfgPath)) {
  $cfg = require $cfgPath;
} else {
  error_log('[CDS Contact] Config file not found: ' . $cfgPath);
  $cfg = [
    'smtp_host' => 'mail.supremecluster.com',
    'smtp_port' => 465,
    'smtp_secure' => 'smtps',
    'smtp_username' => 'contact@castdirectorstudio.com',
    'smtp_password' => '',
    'from_email' => 'contact@castdirectorstudio.com',
    'from_name' => 'Cast Director Studio',
    'admin_email' => 'contact@castdirectorstudio.com',
    'admin_name' => 'Cast Director Studio',
  ];
}

// ---------- Helpers ----------
function jexit(int $code, array $payload)
{
  http_response_code($code);
  echo json_encode($payload, JSON_UNESCAPED_SLASHES);
  exit;
}
function h($s)
{
  return htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

// ---------- Request guards ----------
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
  jexit(405, ['ok' => false, 'error' => 'Method not allowed']);
}

// JSON body size guard (max 64KB)
$raw = file_get_contents('php://input') ?: '';
if (strlen($raw) > 65536) {
  jexit(413, ['ok' => false, 'error' => 'Request too large']);
}

$data = json_decode($raw, true);
if (!is_array($data)) {
  jexit(400, ['ok' => false, 'error' => 'Invalid JSON']);
}

// ---------- Allowed inquiry types ----------
$allowedInquiryTypes = [
  'Product Support',
  'Sales / Licensing',
  'Hosted Credits or Billing',
  'BYOK License Questions',
  'Partnerships / Media',
  'General Question',
];

// ---------- Fields ----------
$name = trim($data['name'] ?? '');
$email = trim($data['email'] ?? '');
$inquiryType = trim($data['inquiryType'] ?? '');
$message = trim($data['message'] ?? '');
$gotcha = trim($data['_gotcha'] ?? '');

// Optional fields
$company = trim($data['company'] ?? '');
$licenseType = trim($data['licenseType'] ?? '');
$orderEmail = trim($data['orderEmail'] ?? '');

// ---------- Honeypot ----------
if ($gotcha !== '') {
  jexit(200, ['ok' => true, 'ticketId' => 'CDS-HONEYPOT']);
}

// ---------- Validation ----------
if ($name === '' || $email === '' || $inquiryType === '' || $message === '') {
  jexit(400, ['ok' => false, 'error' => 'Missing required fields']);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
  jexit(400, ['ok' => false, 'error' => 'Invalid email address']);
}

if (!in_array($inquiryType, $allowedInquiryTypes, true)) {
  jexit(400, ['ok' => false, 'error' => 'Invalid inquiry type']);
}

// Max length enforcement
if (mb_strlen($name) > 120)
  jexit(400, ['ok' => false, 'error' => 'Name too long (max 120)']);
if (mb_strlen($email) > 190)
  jexit(400, ['ok' => false, 'error' => 'Email too long (max 190)']);
if (mb_strlen($message) > 5000)
  jexit(400, ['ok' => false, 'error' => 'Message too long (max 5000)']);
if (mb_strlen($company) > 160)
  jexit(400, ['ok' => false, 'error' => 'Company name too long (max 160)']);
if (mb_strlen($licenseType) > 120)
  jexit(400, ['ok' => false, 'error' => 'License type too long (max 120)']);

if ($orderEmail !== '' && !filter_var($orderEmail, FILTER_VALIDATE_EMAIL)) {
  jexit(400, ['ok' => false, 'error' => 'Invalid order email']);
}

// ---------- Meta ----------
$when = date('c');
$ip = $_SERVER['REMOTE_ADDR'] ?? '';
$ref = $_SERVER['HTTP_REFERER'] ?? '';

// ---------- Ticket ID: CDS-YYMMDD-ABCD ----------
$ticketId = 'CDS-' . date('ymd') . '-' . strtoupper(bin2hex(random_bytes(2)));

// ---------- Brand palette (Cast Director Studio) ----------
$brand = [
  'bg' => '#030a14',
  'card' => '#0a1628',
  'text' => '#e6f0ff',
  'muted' => '#94a3b8',
  'accent1' => '#facc15',  // gold/amber
  'accent2' => '#d4a017',  // deep gold
  'border' => 'rgba(255,255,255,0.06)',
];

// ---------- Build optional fields HTML ----------
$optionalRowsHtml = '';
$optionalRowsAlt = '';
if ($company !== '') {
  $optionalRowsHtml .= '<tr><td style="padding:8px 0;color:' . $brand['muted'] . '"><strong style="color:' . $brand['text'] . '">Company:</strong></td><td style="padding:8px 0">' . h($company) . '</td></tr>';
  $optionalRowsAlt .= "Company: $company\n";
}
if ($licenseType !== '') {
  $optionalRowsHtml .= '<tr><td style="padding:8px 0;color:' . $brand['muted'] . '"><strong style="color:' . $brand['text'] . '">License Type:</strong></td><td style="padding:8px 0">' . h($licenseType) . '</td></tr>';
  $optionalRowsAlt .= "License Type: $licenseType\n";
}
if ($orderEmail !== '') {
  $optionalRowsHtml .= '<tr><td style="padding:8px 0;color:' . $brand['muted'] . '"><strong style="color:' . $brand['text'] . '">Order Email:</strong></td><td style="padding:8px 0">' . h($orderEmail) . '</td></tr>';
  $optionalRowsAlt .= "Order Email: $orderEmail\n";
}

// ---------- Admin email (to admin) ----------
$adminSubject = 'New Cast Director Studio inquiry #' . $ticketId . ': ' . ($inquiryType ?: 'Contact Form');
$adminHtml = '
  <div style="margin:0;padding:24px;background:' . $brand['bg'] . ';font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;color:' . $brand['text'] . '">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;margin:0 auto;background:' . $brand['card'] . ';border-radius:16px;overflow:hidden;border:1px solid ' . $brand['border'] . '">
      <tr><td style="padding:0">
        <div style="background:linear-gradient(90deg, ' . $brand['accent1'] . ' 0%, ' . $brand['accent2'] . ' 100%);padding:18px 24px;color:#000;font-weight:700;letter-spacing:.5px;font-size:18px">
          Cast Director Studio — New Inquiry
        </div>
      </td></tr>
      <tr><td style="padding:24px">
        <div style="text-align:right; padding-top:8px; color:' . $brand['muted'] . '; font-size:12px">
          Ticket ID: <strong style="color:' . $brand['text'] . '">' . h($ticketId) . '</strong>
        </div>
        <h2 style="margin:8px 0 12px 0;font-size:20px;color:' . $brand['text'] . '">Inquiry Details</h2>
        <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse">
          <tr><td style="padding:8px 0;width:180px;color:' . $brand['muted'] . '"><strong style="color:' . $brand['text'] . '">Name:</strong></td><td style="padding:8px 0">' . h($name) . '</td></tr>
          <tr><td style="padding:8px 0;color:' . $brand['muted'] . '"><strong style="color:' . $brand['text'] . '">Email:</strong></td><td style="padding:8px 0">' . h($email) . '</td></tr>
          ' . $optionalRowsHtml . '
          <tr><td style="padding:8px 0;color:' . $brand['muted'] . '"><strong style="color:' . $brand['text'] . '">Inquiry Type:</strong></td><td style="padding:8px 0">' . h($inquiryType) . '</td></tr>
          <tr>
            <td style="padding:8px 0;color:' . $brand['muted'] . ';vertical-align:top"><strong style="color:' . $brand['text'] . '">Message:</strong></td>
            <td style="padding:8px 0">' . nl2br(h($message)) . '</td>
          </tr>
        </table>
        <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.15),transparent);margin:18px 0"></div>
        <p style="margin:0;color:' . $brand['muted'] . ';font-size:12px">
          <strong style="color:' . $brand['text'] . '">Submitted:</strong> ' . h($when) . ' •
          <strong style="color:' . $brand['text'] . '">IP:</strong> ' . h($ip) .
  ($ref ? ' • <strong style="color:' . $brand['text'] . '">From:</strong> ' . h($ref) : '') . '
        </p>
      </td></tr>
      <tr><td style="padding:14px 24px;background:#060e1a;color:' . $brand['muted'] . ';font-size:12px">
        © ' . date('Y') . ' Cast Director Studio by EZ3D Avatars • This email was generated from your website contact form.
      </td></tr>
    </table>
  </div>
';
$adminAlt = "New Cast Director Studio Inquiry (Ticket $ticketId)\n"
  . "Name: $name\n"
  . "Email: $email\n"
  . $optionalRowsAlt
  . "Inquiry Type: $inquiryType\n\n"
  . "Message:\n$message\n\n"
  . "Submitted: $when | IP: $ip" . ($ref ? " | From: $ref" : "");

// ---------- Confirmation email (to inquirer) ----------
$confirmSubject = 'We received your Cast Director Studio inquiry #' . $ticketId;
$confirmHtml = '
  <div style="margin:0;padding:24px;background:' . $brand['bg'] . ';font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;color:' . $brand['text'] . '">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;margin:0 auto;background:' . $brand['card'] . ';border-radius:16px;overflow:hidden;border:1px solid ' . $brand['border'] . '">
      <tr><td style="padding:0">
        <div style="background:linear-gradient(90deg, ' . $brand['accent1'] . ' 0%, ' . $brand['accent2'] . ' 100%);padding:18px 24px;color:#000;font-weight:700;letter-spacing:.5px;font-size:18px">
          Cast Director Studio — Confirmation
        </div>
      </td></tr>
      <tr><td style="padding:24px">
        <div style="text-align:right; padding-top:8px; color:' . $brand['muted'] . '; font-size:12px">
          Ticket ID: <strong style="color:' . $brand['text'] . '">' . h($ticketId) . '</strong>
        </div>
        <h2 style="margin:8px 0 12px 0;font-size:20px;color:' . $brand['text'] . '">Thanks, ' . h($name) . ' — we received your message</h2>
        <p style="margin:0 0 16px 0; color:' . $brand['muted'] . '">Your request has been received and assigned ticket <strong style="color:' . $brand['text'] . '">' . h($ticketId) . '</strong>. We\'ll review it and respond as soon as possible. We typically respond within <strong style="color:' . $brand['text'] . '">1–2 business days</strong>.</p>

        <h3 style="margin:16px 0 8px 0;color:' . $brand['text'] . ';font-size:16px">Summary</h3>
        <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse">
          <tr><td style="padding:8px 0;width:180px;color:' . $brand['muted'] . '"><strong style="color:' . $brand['text'] . '">Inquiry Type:</strong></td><td style="padding:8px 0;color:' . $brand['text'] . '">' . h($inquiryType) . '</td></tr>
          <tr>
            <td style="padding:8px 0;color:' . $brand['muted'] . ';vertical-align:top"><strong style="color:' . $brand['text'] . '">Message:</strong></td>
            <td style="padding:8px 0;color:' . $brand['text'] . '">' . nl2br(h($message)) . '</td>
          </tr>
        </table>

        <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.15),transparent);margin:18px 0"></div>
        <p style="margin:0;color:' . $brand['muted'] . ';font-size:12px">
          <strong style="color:' . $brand['text'] . '">Submitted:</strong> ' . h($when) . '
        </p>
      </td></tr>
      <tr><td style="padding:14px 24px;background:#060e1a;color:' . $brand['muted'] . ';font-size:12px">
        © ' . date('Y') . ' Cast Director Studio by EZ3D Avatars • This confirmation summarizes what you sent via our contact form.
      </td></tr>
    </table>
  </div>
';
$confirmAlt = "Thanks, $name — we received your Cast Director Studio message.\nTicket: $ticketId\n\n"
  . "Inquiry Type: $inquiryType\n\n"
  . "Message:\n$message\n\n"
  . "Submitted: $when\n";

// ---------- Send admin email ----------
try {
  $mail = new PHPMailer(true);
  $mail->isSMTP();
  $mail->Host = $cfg['smtp_host'];
  $mail->Port = (int) $cfg['smtp_port'];
  $mail->SMTPSecure = $cfg['smtp_secure'] === 'smtps' ? PHPMailer::ENCRYPTION_SMTPS : PHPMailer::ENCRYPTION_STARTTLS;
  $mail->SMTPAuth = true;
  $mail->Username = $cfg['smtp_username'];
  $mail->Password = $cfg['smtp_password'];

  $mail->setFrom($cfg['from_email'], $cfg['from_name']);
  $mail->addAddress($cfg['admin_email'], $cfg['admin_name']);
  $mail->addReplyTo($email, $name);

  $mail->isHTML(true);
  $mail->Subject = $adminSubject;
  $mail->Body = $adminHtml;
  $mail->AltBody = $adminAlt;

  $mail->send();

  // ---------- Send confirmation to inquirer ----------
  $auto = new PHPMailer(true);
  $auto->isSMTP();
  $auto->Host = $cfg['smtp_host'];
  $auto->Port = (int) $cfg['smtp_port'];
  $auto->SMTPSecure = $cfg['smtp_secure'] === 'smtps' ? PHPMailer::ENCRYPTION_SMTPS : PHPMailer::ENCRYPTION_STARTTLS;
  $auto->SMTPAuth = true;
  $auto->Username = $cfg['smtp_username'];
  $auto->Password = $cfg['smtp_password'];

  $auto->setFrom($cfg['from_email'], $cfg['from_name']);
  $auto->addAddress($email, $name);
  $auto->addReplyTo($cfg['from_email'], $cfg['from_name']);

  $auto->isHTML(true);
  $auto->Subject = $confirmSubject;
  $auto->Body = $confirmHtml;
  $auto->AltBody = $confirmAlt;

  // Don't fail the whole request if confirmation fails
  try {
    $auto->send();
  } catch (\Throwable $e) {
    error_log('[CDS Contact] Autoresponder failed: ' . $e->getMessage());
  }

  jexit(200, ['ok' => true, 'ticketId' => $ticketId]);

} catch (\Throwable $e) {
  error_log('[CDS Contact] Mail send failed: ' . $e->getMessage());
  jexit(500, ['ok' => false, 'error' => 'Mail failed']);
}
