/**
 * Text patches applied to the engine lifted from page 177, on top of the
 * transport swaps in extract-engine.mjs.
 *
 * Refund path (Priscilla, 2026-10-08): when the construction cost went DOWN
 * the PA still amends the permit and the town gives the extra arbitrios and
 * patente back. The papers built for the town and the close-out email to the
 * PA say so instead of "aumento" / "a pagar". A row's amount (r.amt) is
 * negative on a refund; refundCase(c) lives in public/engine-app.js.
 *
 * Each pair is [exact text in page 177, replacement]. Applied by
 * extract-engine.mjs, and by apply-patches.mjs to an existing engine.js.
 */
export const PATCHES = [
  // Calculation sheet (Calculo de Arbitrios y Patentes)
  ["row('Aumento sujeto a enmienda',money(r.amt),10,bold);",
   "row(r.amt<0?'Reduccion sujeta a enmienda':'Aumento sujeto a enmienda',money(Math.abs(r.amt)),10,bold);"],
  ["cn('Arbitrios de construccion sobre el aumento',(r.rate||0),r.adue);",
   "cn('Arbitrios de construccion sobre '+(r.amt<0?'la reduccion':'el aumento'),(r.rate||0),Math.abs(r.adue));"],
  ["if(r.prate>0) cn('Patente de construccion sobre el aumento',(r.prate||0),r.pdue);",
   "if(r.prate>0) cn('Patente de construccion sobre '+(r.amt<0?'la reduccion':'el aumento'),(r.prate||0),Math.abs(r.pdue));"],
  ["t(M,'TOTAL A PAGAR',10.5,bold);",
   "t(M,r.amt<0?'TOTAL A REEMBOLSAR AL CONTRATISTA':'TOTAL A PAGAR',10.5,bold);"],
  ["var wt=bold.widthOfTextAtSize(money(r.adue+r.pdue),10.5);",
   "var wt=bold.widthOfTextAtSize(money(Math.abs(r.adue+r.pdue)),10.5);"],
  ["page.drawText(money(r.adue+r.pdue),{x:W-M-wt,",
   "page.drawText(money(Math.abs(r.adue+r.pdue)),{x:W-M-wt,"],
  ["+'como referencia y desglose del aumento.',",
   "+'como referencia y desglose '+(r.amt<0?'de la reduccion y del reembolso.':'del aumento.'),"],

  // Cover letter to the town (Carta al municipio)
  ["para('AUMENTO EN EL COSTO DE LA OBRA');",
   "para(r.amt<0?'REDUCCION EN EL COSTO DE LA OBRA':'AUMENTO EN EL COSTO DE LA OBRA');"],
  ["para('  Aumento: '+money(r.amt));",
   "para((r.amt<0?'  Reduccion: ':'  Aumento: ')+money(Math.abs(r.amt)));"],
  ["para('  Arbitrios sobre el aumento ('+(r.rate||0)+'%): '+money(r.adue));",
   "para('  Arbitrios sobre '+(r.amt<0?'la reduccion, a reembolsar':'el aumento')+' ('+(r.rate||0)+'%): '+money(Math.abs(r.adue)));"],
  ["if(r.pdue>0) para('  Patente sobre el aumento ('+(r.prate||0)+'%): '+money(r.pdue));",
   "if(r.pdue) para('  Patente sobre '+(r.amt<0?'la reduccion, a reembolsar':'el aumento')+' ('+(r.prate||0)+'%): '+money(Math.abs(r.pdue)));"],

  // Base subject to taxes, in the case summary
  ["row2('Aumento en el costo de construccion',money(r.amt));",
   "row2(r.amt<0?'Reduccion en el costo de construccion':'Aumento en el costo de construccion',money(Math.abs(r.amt)));"],
  ["row2('Arbitrios sobre el aumento ('+(r.rate||0)+'%)',money(r.adue));",
   "row2('Arbitrios sobre '+(r.amt<0?'la reduccion':'el aumento')+' ('+(r.rate||0)+'%)',money(Math.abs(r.adue)));"],
  ["if(r.prate>0) row2('Patente sobre el aumento ('+(r.prate||0)+'%)',money(r.pdue));",
   "if(r.prate>0) row2('Patente sobre '+(r.amt<0?'la reduccion':'el aumento')+' ('+(r.prate||0)+'%)',money(Math.abs(r.pdue)));"],

  // Close-out email to the PA
  ["(c.paid?'Impuestos pagados: '+us(c.paid)+'\\n':'')",
   "(c.paid?(refundCase(c)?'Reembolso reclamado al municipio: ':'Impuestos pagados: ')+us(c.paid)+'\\n':'')"],
  ["+'\\nAdjuntamos:\\n  1. Evidencia del pago de arbitrios y patente\\n",
   "+'\\nAdjuntamos:\\n  1. '+(refundCase(c)?'Evidencia de la reclamacion de reembolso de arbitrios y patente':'Evidencia del pago de arbitrios y patente')+'\\n"],
];

export function applyPatches(js) {
  for (const [a, b] of PATCHES) {
    if (js.includes(b)) continue; // already applied
    if (!js.includes(a)) throw new Error("patch target not found: " + a.slice(0, 70));
    js = js.split(a).join(b);
  }
  return js;
}
