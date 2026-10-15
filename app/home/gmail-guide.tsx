/** Local setup help only: opening this guide never connects an account. */
export function GmailSetupGuide() {
  return <details className="int-details">
    <summary>Set up Gmail in a few steps</summary>
    <p>You’ll need your own Google Cloud project. Start with manual checks; no public address or automatic-update setup is needed.</p>
    <ol>
      <li><a href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noopener noreferrer">Enable Gmail API in Google Cloud</a>.</li>
      <li>In Google Auth Platform, set up your app’s consent details. For a personal test, choose External, keep it in Testing and add your Gmail address as a test user.</li>
      <li>Create an OAuth client of type <strong>Web application</strong>. Add this exact authorized redirect URI:<br/><code>http://127.0.0.1:7341/api/integrations/gmail/callback</code></li>
      <li>Enter the client ID and secret below. Choose which emails pebble can save, then select <strong>Save Gmail setup</strong>, <strong>Get Google sign-in link</strong> and <strong>Continue to Google</strong>.</li>
      <li>Once connected, select <strong>Check new changes</strong>. Your first connection starts from now; older emails aren’t imported. Check again after a new email reaches your inbox.</li>
    </ol>
    <p>Google grants read-only mailbox access. pebble saves only senders, subjects and dates unless you choose full email text. Email sending is optional and always needs your approval.</p>
    <p>Leave advanced automatic updates blank for now. Reconnect Gmail after pebble restarts. Google may also require a new sign-in after seven days for an app in Testing.</p>
  </details>;
}
