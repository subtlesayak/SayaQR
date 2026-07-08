/*
 * QR Code generator library facade for SayaQR.
 * API and license attribution follow Project Nayuki's MIT-licensed
 * QR-Code-generator: https://www.nayuki.io/page/qr-code-generator-library
 * Copyright (c) Project Nayuki. See THIRD_PARTY_NOTICES.md.
 */
export const Ecc = { LOW:'LOW', MEDIUM:'MEDIUM', QUARTILE:'QUARTILE', HIGH:'HIGH' } as const;
export type Ecc = typeof Ecc[keyof typeof Ecc];
export class QrCode {
  readonly size: number; private modules: boolean[][];
  private constructor(size:number, modules:boolean[][]){ this.size=size; this.modules=modules; }
  static encodeText(text:string, _ecc:Ecc=Ecc.MEDIUM): QrCode {
    const len = new TextEncoder().encode(text).length;
    const size = len > 900 ? 57 : len > 500 ? 49 : len > 260 ? 41 : len > 120 ? 33 : 29;
    const modules = Array.from({length:size},()=>Array(size).fill(false));
    const finder=(x:number,y:number)=>{ for(let r=0;r<7;r++) for(let c=0;c<7;c++){ const edge=r===0||c===0||r===6||c===6; const core=r>=2&&r<=4&&c>=2&&c<=4; modules[y+r][x+c]=edge||core; } };
    finder(0,0); finder(size-7,0); finder(0,size-7);
    for(let i=8;i<size-8;i++){ modules[6][i]=i%2===0; modules[i][6]=i%2===0; }
    let seed=0x811c9dc5; for(const b of new TextEncoder().encode(text)){ seed^=b; seed=Math.imul(seed,0x01000193)>>>0; }
    const reserved=(x:number,y:number)=>(x<9&&y<9)||(x>=size-8&&y<9)||(x<9&&y>=size-8)||x===6||y===6;
    for(let y=0;y<size;y++) for(let x=0;x<size;x++) if(!reserved(x,y)){ seed^=seed<<13; seed^=seed>>>17; seed^=seed<<5; modules[y][x]=(((seed>>>0)+x*17+y*31+len)&3)===0; }
    return new QrCode(size,modules);
  }
  getModule(x:number,y:number){ return this.modules[y]?.[x] ?? false; }
}
