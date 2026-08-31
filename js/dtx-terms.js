(function () {
  const CSS = [
    '.dtx-terms{font-size:12px;color:#374151;line-height:1.55;background:#F8FAFC;border:1.5px solid #D0D5DD;border-radius:8px;padding:14px 16px;max-height:240px;overflow:auto;}',
    '.dtx-terms h4{font-size:12px;color:#1B4F8A;margin:14px 0 4px;text-transform:uppercase;letter-spacing:.4px;}',
    '.dtx-terms h4:first-child{margin-top:0;}',
    '.dtx-terms p{margin:0 0 6px;}',
    '.dtx-terms ol,.dtx-terms ul{margin:0 0 6px 18px;padding:0;}',
    '.dtx-terms li{margin:3px 0;}',
    '.dtx-terms-agree{display:flex;gap:10px;align-items:flex-start;margin:12px 0 0;font-size:13px;font-weight:600;color:#111;line-height:1.4;}',
    '.dtx-terms-agree input{width:18px;height:18px;margin-top:2px;flex-shrink:0;accent-color:#E87722;cursor:pointer;}',
    '.dtx-terms-agree label{cursor:pointer;}',
  ].join('');

  const HTML = [
    '<h4>How an order works</h4>',
    '<ol>',
    '<li><strong>Quote.</strong> Submitting this form is a request, not a purchase. Price, drawings, glass sizes, and lead time are estimates. You are not obligated until you approve a confirmation drawing and pay.</li>',
    '<li><strong>Confirmation drawing.</strong> Doortronix reviews the quote and sends a confirmation drawing. That drawing is still preliminary until you sign it. Do not cut glass or fabricate from a quote preview or an unsigned drawing.</li>',
    '<li><strong>Pay in your account.</strong> Create a free Doortronix account to approve the drawing, pay the deposit or the full amount, track the order, and reorder the same package later. Fabrication does not start until payment clears.</li>',
    '<li><strong>Fabricate and ship.</strong> After cleared deposit or full payment, we build the aluminum door package in Malakoff, Texas and ship it. Lead time starts on the day payment clears, not the day you sign.</li>',
    '</ol>',
    '<h4>What we sell</h4>',
    '<p>We sell the <strong>aluminum door package only</strong> — frame, panels, hardware, and operator. Price does <strong>not</strong> include glass, glazing, freight, installation, or taxes. Glass is supplied and installed by others. Frames are prepped for the glass thickness you select.</p>',
    '<h4>Drawings and glass sizes</h4>',
    '<ul>',
    '<li>Live quote drawings and unsigned confirmation drawings are preliminary. They are not released for fabrication or glass.</li>',
    '<li>The signed confirmation drawing is the drawing of record. We build what that sheet shows.</li>',
    '<li>Before you sign, you must check field dimensions, handing, swing, finish, hardware, configuration, and glass sizes against the job.</li>',
    '<li>If you sign a sheet that has the wrong size, handing, or configuration, and we build that sheet, that error is yours. Changes after fabrication starts may be billed.</li>',
    '<li>If we build something different from the signed confirmation drawing, we will repair or replace that door package, or refund what you paid for it.</li>',
    '<li>Do not cut glass from any drawing until the confirmation is signed. The glazier must still verify sizes in the opening. Doortronix is not responsible for glass cut too early or not field-checked.</li>',
    '</ul>',
    '<h4>Payment, freight, and changes</h4>',
    '<ul>',
    '<li>Pay the deposit or the full amount from your account (or as invoiced). Title and risk of loss pass FOB our dock in Malakoff, TX.</li>',
    '<li>Freight is extra and quoted at ship time. Installation is by others.</li>',
    '<li>Standard limited warranty is one year against defects in materials and workmanship on the door package we supplied.</li>',
    '</ul>',
    '<h4>If something is wrong</h4>',
    '<p>Our responsibility for a Doortronix error is limited to repairing or replacing the door package, or refunding amounts paid for that package. We are not responsible for delay, recut glass, lost profit, liquidated damages, or other job costs. A quote is free to submit and free to walk away from until you sign and pay.</p>',
  ].join('');

  function ensureStyle() {
    if (document.getElementById('dtx-terms-css')) return;
    const s = document.createElement('style');
    s.id = 'dtx-terms-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function mount(el, opts) {
    if (!el) return;
    ensureStyle();
    const o = opts || {};
    el.classList.add('dtx-terms');
    el.innerHTML = HTML;
    if (o.agreeId) {
      const row = document.createElement('div');
      row.className = 'dtx-terms-agree';
      row.innerHTML = '<input type="checkbox" id="' + o.agreeId + '">' +
        '<label for="' + o.agreeId + '">' + (o.agreeLabel || 'I have read these terms. I understand the quote and drawings are not confirmed until I sign a confirmation drawing and pay.') + '</label>';
      el.parentNode.insertBefore(row, el.nextSibling);
    }
  }

  window.DTX_TERMS = { mount: mount, html: function () { return HTML; } };
})();
