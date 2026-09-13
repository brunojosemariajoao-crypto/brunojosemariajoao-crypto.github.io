// Início fixo solicitado pelo operador: 13/09/2026, 00:00 em Lisboa (UTC+1).
export const ANALYSIS_START_AT='2026-09-12T23:00:00.000Z';
export function isInAnalysisWindow(messages:any[]){
 const dates=(messages||[]).filter(m=>m?.direction!=='out').map(m=>Date.parse(m?.date||'')).filter(Number.isFinite);
 return dates.length>0&&Math.max(...dates)>=Date.parse(ANALYSIS_START_AT);
}
