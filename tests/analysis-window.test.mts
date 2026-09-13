import test from 'node:test';
import assert from 'node:assert/strict';
import {isInAnalysisWindow} from '../netlify/functions/_shared/analysis-window.mts';
test('corte é a meia-noite de 13 setembro em Lisboa, não UTC',()=>{
 assert.equal(isInAnalysisWindow([{direction:'in',date:'2026-09-12T22:59:59Z'}]),false);
 assert.equal(isInAnalysisWindow([{direction:'in',date:'2026-09-12T23:00:00Z'}]),true);
});
test('mensagem enviada hoje não reabre pedido anterior, mas nova resposta recebida sim',()=>{
 const old={direction:'in',date:'2026-09-11T14:00:00Z'};
 assert.equal(isInAnalysisWindow([old,{direction:'out',date:'2026-09-13T10:00:00Z'}]),false);
 assert.equal(isInAnalysisWindow([old,{direction:'in',date:'2026-09-13T10:00:00Z'}]),true);
 assert.equal(isInAnalysisWindow([{direction:'in',date:'2026-10-01T10:00:00Z'}]),true);
 assert.equal(isInAnalysisWindow([{direction:'in',date:'invalid'}]),false);
});
