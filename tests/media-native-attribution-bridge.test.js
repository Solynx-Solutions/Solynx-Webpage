const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/../digital-media-tech/native-attribution-bridge.js','utf8');
const origin='https://link.solynx.solutions', formId='1NHtVDOSdhAUtCKRcvo8', locationId='X7gmSDv2qIOri1Al4ewE';
function setup(href='https://www.solynx.solutions/digital-media-tech/?utm_source=google&utm_medium=organic&utm_campaign=gbp&email=PRIVATE&project_brief=PRIVATE#PRIVATE') {
  let listener; const sent=[];
  class Frame { constructor() { this.attributes={}; } setAttribute(key,value) { this.attributes[key]=value; } }
  const frame=new Frame();
  Object.assign(frame,{id:'scopeNativeForm',src:origin+'/widget/form/'+formId+'?project_brief=PRIVATE',contentWindow:{postMessage:(data,target)=>sent.push({data,target})}});
  vm.runInNewContext(source,{URL,HTMLIFrameElement:Frame,window:{location:{href},addEventListener:(name,fn)=>listener=fn},document:{getElementById:()=>frame,referrer:'https://www.google.com/search?q=PRIVATE#PRIVATE'}});
  const send=(overrides={})=>listener({origin,source:frame.contentWindow,data:['fetch-query-params','frame-name',locationId,formId],...overrides});
  return {frame,sent,send};
}
test('native protocol supplies campaign/landing URL without private query, brief or fragment',()=>{
  const {sent,send}=setup();send();assert.equal(sent.length,1);
  const {data,target}=sent[0];assert.equal(target,origin);assert.equal(data[0],'query-params');
  assert.deepEqual(JSON.parse(JSON.stringify(data[1])),{utm_source:'google',utm_medium:'organic',utm_campaign:'gbp'});
  assert.equal(data[2],'https://www.solynx.solutions/digital-media-tech/?utm_source=google&utm_medium=organic&utm_campaign=gbp');
  assert.equal(data[3],'https://www.google.com/search');assert.equal(data[4],'scopeNativeForm');
  assert.ok(!JSON.stringify(data).includes('PRIVATE'));
});
test('other origin/window/form/location and unrelated protocol actions cannot trigger response',()=>{
  const {sent,send}=setup();
  send({origin:'https://attacker.example'});send({source:{}});
  send({data:['fetch-query-params','frame-name',locationId,'other-form']});
  send({data:['fetch-query-params','frame-name','other-location',formId]});
  for(const action of ['set-sticky-contacts','fetch-sticky-contacts','modify-parent-url'])send({data:[action]});
  send({data:{action:'fetch-query-params'}});assert.equal(sent.length,0);
});
test('exact native iframeLoaded bootstraps query request with resize and public methods disabled',()=>{
  const {frame,sent,send}=setup();
  send({data:['iframeLoaded'],origin:'https://attacker.example'});
  send({data:['iframeLoaded'],source:{}});
  assert.equal(sent.length,0);
  send({data:['iframeLoaded']});assert.equal(sent.length,1);
  assert.equal(sent[0].target,origin);
  assert.equal(sent[0].data,'[iFrameSizer]scopeNativeForm:8:false:false:32:false:false:8px:offset:null:null:0');
  assert.equal(frame.attributes['data-native-attribution-bridge'],'initialized');
  send();assert.equal(frame.attributes['data-native-attribution-bridge'],'responded');
  assert.deepEqual(Object.keys(frame.attributes),['data-native-attribution-bridge']);
});
test('receiver iframe URL must be exact form and origin',()=>{
  const {frame,sent,send}=setup();frame.src=origin+'/widget/form/other';send();
  frame.src='https://attacker.example/widget/form/'+formId;send();assert.equal(sent.length,0);
});
test('untagged and invalid campaign values never manufacture attribution',()=>{
  for(const url of ['https://www.solynx.solutions/digital-media-tech/','https://www.solynx.solutions/digital-media-tech/?utm_source=private%40example.com&utm_campaign='+ 'x'.repeat(81)]) {
    const {sent,send}=setup(url);send();assert.equal(sent.length,1);assert.equal(Object.keys(sent[0].data[1]).length,0);
    assert.equal(sent[0].data[2],'https://www.solynx.solutions/digital-media-tech/');
  }
});
