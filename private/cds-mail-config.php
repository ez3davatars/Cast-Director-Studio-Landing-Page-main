<?php
/**
 * cds-mail-config.php — Cast Director Studio SMTP Configuration
 *
 * IMPORTANT: This file must be placed OUTSIDE the public web root.
 * Expected location: /private/cds-mail-config.php
 * (one level above the public/ or public_html/ directory)
 *
 * DO NOT commit this file with real passwords to version control.
 * Copy this template to your server and fill in the real values.
 */
return [
  'smtp_host'     => 'mail.supremecluster.com',
  'smtp_port'     => 465,
  'smtp_secure'   => 'smtps',        // 'smtps' (port 465) or 'tls' (port 587)
  'smtp_username' => 'contact@ez3davatars.com',
  'smtp_password' => 'SERVER_SIDE_PASSWORD_HERE',   // <-- Set this on the server
  'from_email'    => 'contact@ez3davatars.com',
  'from_name'     => 'Cast Director Studio',
  'admin_email'   => 'contact@ez3davatars.com',     // Where admin notifications go
  'admin_name'    => 'Cast Director Studio',
];
