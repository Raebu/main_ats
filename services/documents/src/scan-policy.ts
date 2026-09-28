export type ScanStatus="SCAN_PENDING"|"PROCESSED"|"QUARANTINED";

export function initialScanPolicy(input:{developmentBypass:boolean;scannerConfigured:boolean}){
  if(input.developmentBypass)return{clean:true,reason:"development_bypass",pending:false};
  if(!input.scannerConfigured)return{clean:false,reason:"scanner_not_configured",pending:true};
  return{clean:false,reason:"scanner_required",pending:false};
}

export function statusForScanResult(clean:boolean):ScanStatus{
  return clean?"PROCESSED":"QUARANTINED";
}
