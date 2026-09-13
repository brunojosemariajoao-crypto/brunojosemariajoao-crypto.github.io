import test from "node:test";
import assert from "node:assert/strict";
import { responsesEndpoint } from "../netlify/functions/_shared/ai-endpoint.mts";

test("mantém o acesso direto quando existe uma chave própria", () => {
  assert.equal(responsesEndpoint(), "https://api.openai.com/v1/responses");
});
test("encaminha a chave do gateway para o gateway e preserva o caminho", () => {
  assert.equal(responsesEndpoint("https://gateway.example/provider/openai"), "https://gateway.example/provider/openai/v1/responses");
});
test("não duplica v1 quando o endereço já contém a versão", () => {
  assert.equal(responsesEndpoint("https://gateway.example/provider/openai/v1/"), "https://gateway.example/provider/openai/v1/responses");
});
test("não transmite a chave através de uma ligação sem HTTPS", () => {
  assert.throws(() => responsesEndpoint("http://gateway.example"));
});
