import test from 'node:test';
import assert from 'node:assert/strict';
import {noticeContext,replyBlockReason,operationalReceipt} from '../netlify/functions/_shared/operational-guards.mts';
const incoming={id:'in1',direction:'in',from:'Loja <loja@example.com>',date:'2026-09-14T12:00:00Z'};
test('não confirma novamente histórico nem pedido já respondido',()=>{
 assert.match(replyBlockReason([incoming],'2026-09-14T13:00:00Z',Date.parse('2026-09-14T14:00:00Z')),/Histórico/);
 assert.match(replyBlockReason([incoming,{direction:'out',date:'2026-09-14T12:01:00Z'}],'2026-09-14T11:00:00Z',Date.parse('2026-09-14T14:00:00Z')),/Já existe/);
 assert.equal(replyBlockReason([incoming],'2026-09-14T11:00:00Z',Date.parse('2026-09-14T14:00:00Z')),'');
});
test('usa aviso anterior para a loja certa e exclui avisos futuros ou antigos',()=>{
 const notice={id:'n1',direction:'out',to:'loja@example.com',date:'2026-09-13T10:00:00Z',text:'Courgette indisponível esta semana'};
 const all=[notice,{...notice,id:'n2',to:'outra@example.com'},{...notice,id:'n3',date:'2026-09-15T10:00:00Z'},{...notice,id:'n4',date:'2026-08-01T10:00:00Z'}];
 assert.deepEqual(noticeContext(all,[incoming]).map(x=>x.id),['n1']);
});
test('recibo separa artigos indisponíveis dos artigos confirmados',()=>{
 const text=operationalReceipt({deliveryDate:'2026-09-15',items:[{product:'alface',quantity:1,unit:'cx'},{product:'courgette',quantity:1,unit:'cx',fulfillment:'unavailable'}]});
 assert.match(text,/15\/09\/2026/);assert.match(text,/não ficam confirmados:\n- 1 cx courgette/);
 assert.equal(text.split('Não estão disponíveis')[0].includes('courgette'),false);
});
