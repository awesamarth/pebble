import {expect,test} from 'bun:test';
import {gmailCallbackReason,gmailOAuthMessage} from './gmail-oauth-errors';
test('Gmail OAuth redirects expose fixed failure codes and actionable messages only',()=>{
 expect(gmailCallbackReason('Gmail: gmail http 403.')).toBe('gmail_http_403');expect(gmailOAuthMessage('gmail_http_403')).toContain('Gmail API');expect(gmailCallbackReason('Gmail: invalid oauth state.')).toBe('invalid_oauth_state');expect(gmailOAuthMessage('invalid_oauth_state')).toContain('expired');for(const value of ['secret=do-not-expose','Gmail: unexpected sensitive details.',null,{access_token:'not-allowed'}])expect(gmailCallbackReason(value)).toBeUndefined();expect(gmailOAuthMessage('secret=do-not-expose')).not.toContain('secret');
});
