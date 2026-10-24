import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = p => readFileSync(p,'utf8');
test('user-selected agent can execute the assigned work',()=>{
 assert.match(read('AGENTS.md'), /توجيه التنفيذ/);
 assert.match(read('CLAUDE.md'), /@AGENTS\.md/);
 assert.doesNotMatch(read('CLAUDE.md'),/For the first session: perform a read-only audit/);
});
test('Darb landing content and release review remain RTL',()=>{
 const html=read('index.html');
 assert.match(html, /<html[^>]+dir=["']rtl["']/i);
 assert.match(html, /درب\s*\|\s*Path/i);
 assert.match(read('docs/ENGINEERING_PLAYBOOK.md'),/بوابات الجودة بحسب الخطر/);
 assert.match(read('.github/PULL_REQUEST_TEMPLATE.md'),/بوابة جودة/);
});