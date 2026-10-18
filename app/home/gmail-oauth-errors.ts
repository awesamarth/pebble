// Only fixed diagnostic codes cross the OAuth redirect; never include Google's response or URL.
const messages:Record<string,string>={
 invalid_oauth_state:'This Google sign-in session expired or was replaced. Close the old sign-in tab, then choose Continue to Google again.',
 oauth_configuration_required:'Your Gmail setup needs to be saved again. Save your Google client setup, then continue to Google.',
 oauth_exchange_failed:'Google sign-in returned, but the code exchange failed. Check the saved client secret and exact callback address.',
 readonly_scope_required:'Google did not grant Gmail read access. Reconnect and include the requested read permission.',
 gmail_http_403:'Google sign-in finished, but Gmail access was denied. Check that Gmail API is enabled in the same Google Cloud project and your account has the requested access.',
 gmail_http_401:'Google sign-in returned an unusable Gmail session. Choose Continue to Google for a fresh sign-in.',
 invalid_mail_profile:'Google returned an incomplete Gmail profile. Check the selected account and try again.',
 invalid_history_id:'Gmail returned an invalid synchronization position. Try connecting again.',
 session_disconnected:'Gmail setup changed while signing in. Use Continue to Google from the current saved setup.',
 google_denied:'Google sign-in was cancelled or denied. Your saved setup is unchanged.',
 runtime_unavailable:'Google returned to pebble, but pebble couldn’t finish the connection. Check that pebble is running.'
};
export function gmailCallbackReason(error:unknown):string|undefined{if(typeof error!=='string')return;const match=/^Gmail: ([a-z0-9 ]+)\.$/.exec(error);const code=match?.[1].replaceAll(' ','_');return code&&Object.hasOwn(messages,code)?code:undefined;}
export function gmailOAuthMessage(reason:string|null){return reason&&Object.hasOwn(messages,reason)?messages[reason]:'Gmail authorization did not complete. Check setup and try again.';}
