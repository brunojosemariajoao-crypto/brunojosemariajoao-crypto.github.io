export function cleanCurrentMailText(value:any){
  let text=String(value||"").replace(/\r/g,"").trim();
  if(!text)return "";

  const markers=[
    /^Em .{3,160} escreveu:\s*$/mi,
    /^Às .{3,160} escreveu:\s*$/mi,
    /^On .{3,160} wrote:\s*$/mi,
    /^-{2,}\s*Mensagem original\s*-{2,}\s*$/mi,
    /^-{2,}\s*Original Message\s*-{2,}\s*$/mi,
    /^_{5,}\s*$/m,
    // Outlook/Exchange costuma converter o cabeçalho da mensagem citada para texto simples.
    /^De:\s+.{3,240}$/mi,
    /^From:\s+.{3,240}$/mi
  ];
  const positions=markers.map(re=>text.search(re)).filter(n=>n>0);
  if(positions.length)text=text.slice(0,Math.min(...positions));

  text=text
    .split(/Este e-mail foi analisado pelo software antivírus Avast/i)[0]
    .split(/This email has been checked for viruses by Avast/i)[0]
    .replace(/^>.*$/gm,"")
    .replace(/\n{3,}/g,"\n\n")
    .trim();

  return text.slice(0,7000);
}
