const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const QUOTE_COPY = Object.freeze({
  en: {
    title: 'Request a quote', intro: 'Tell us the route and how you prefer to be contacted. A coordinator will follow up.',
    name: 'Full name', service: 'Service required', choose: 'Choose a service', origin: 'Origin', destination: 'Destination',
    method: 'Contact method', email: 'Email', phone: 'Phone', whatsapp: 'WhatsApp', detail: 'Contact details',
    notes: 'Shipment or move details (optional)', date: 'Preferred date', placeholder: 'Size or special requirements', submit: 'Send request',
    essentials: 'Essentials', shipment: 'Shipment / move', review: 'Review', next: 'Next', back: 'Back',
    reviewLead: 'Check the details before opening your request email.', foot: 'Opens a prepared email to the operations team.',
    missing: 'Not provided', invalid: 'Please complete the required fields.', opening: 'Opening your email app to complete the request.',
    subject: 'Website quote request', labels: { name: 'Name', service: 'Service', contactMethod: 'Contact method', contact: 'Contact details', origin: 'Origin', destination: 'Destination', date: 'Preferred date', notes: 'Details' },
    contactLabels: { email: 'Email address', phone: 'Phone number', whatsapp: 'WhatsApp number' },
    emailValidity: 'Enter a valid email address.', phoneValidity: 'Enter a valid phone number.'
  },
  ar: {
    title: 'اطلب عرض سعر', intro: 'أخبرنا بالمسار وطريقة التواصل المفضلة. سيتابع معك منسق من فريقنا.',
    name: 'الاسم الكامل', service: 'الخدمة المطلوبة', choose: 'اختر خدمة', origin: 'من', destination: 'إلى',
    method: 'طريقة التواصل', email: 'البريد الإلكتروني', phone: 'هاتف', whatsapp: 'واتساب', detail: 'بيانات التواصل',
    notes: 'تفاصيل الشحنة / النقلة (اختياري)', date: 'التاريخ المفضل', placeholder: 'الحجم أو أي متطلبات خاصة', submit: 'إرسال الطلب',
    essentials: 'البيانات الأساسية', shipment: 'تفاصيل الشحنة / النقلة', review: 'المراجعة', next: 'التالي', back: 'السابق',
    reviewLead: 'راجع البيانات قبل فتح رسالة الطلب.', foot: 'يفتح رسالة بريد إلكتروني جاهزة إلى فريق العمليات.',
    missing: 'غير مذكور', invalid: 'يرجى إكمال الحقول المطلوبة.', opening: 'جارٍ فتح تطبيق البريد لإكمال الإرسال.',
    subject: 'طلب عرض سعر من الموقع', labels: { name: 'الاسم', service: 'الخدمة', contactMethod: 'طريقة التواصل', contact: 'بيانات التواصل', origin: 'من', destination: 'إلى', date: 'التاريخ المفضل', notes: 'التفاصيل' },
    contactLabels: { email: 'البريد الإلكتروني', phone: 'رقم الهاتف', whatsapp: 'رقم واتساب' },
    emailValidity: 'أدخل بريدًا إلكترونيًا صحيحًا.', phoneValidity: 'أدخل رقم هاتف صحيحًا.'
  }
});

/**
 * `header: false` drops the form's own masthead. The website's quote and contact pages already
 * open with a hero that says "Request a quote" and a lead under it, so the form's copy of the
 * same heading printed the title twice on one screen — the client struck the second one through
 * (2026-09-21). The journey's beat has no hero above the form and keeps the header.
 */
export function renderQuoteForm({ lang = 'en', recipient, services = [], eyebrow = '', header = true } = {}) {
  const L = QUOTE_COPY[lang] ?? QUOTE_COPY.en;
  const options = services.map((row) => typeof row === 'string'
    ? { value: row, label: row }
    : { value: row.slug ?? row.name?.en, label: row.name?.[lang] ?? row.name?.en }).filter((row) => row.label);
  return `<form class="journey-quote" data-quote-form data-recipient="${esc(recipient)}" data-lang="${esc(lang)}" novalidate>
    ${header ? `<header class="quote-intro"><p class="eyebrow">${esc(eyebrow)}</p><h2>${esc(L.title)}</h2><p>${esc(L.intro)}</p></header>` : ''}
    <ol class="quote-progress" aria-label="${esc(L.title)}">${[L.essentials,L.shipment,L.review].map((label,i)=>`<li data-progress-step="${i+1}"${i===0?' aria-current="step"':''}><b>0${i+1}</b><span>${esc(label)}</span></li>`).join('')}</ol>
    <section class="quote-step" data-quote-step="1"><div class="quote-grid">
      <label class="quote-field quote-span"><span>${esc(L.name)} <b>*</b></span><input name="name" autocomplete="name" required></label>
      <label class="quote-field quote-span"><span>${esc(L.service)} <b>*</b></span><select name="service" required><option value="">${esc(L.choose)}</option>${options.map((row)=>`<option value="${esc(row.value)}">${esc(row.label)}</option>`).join('')}</select></label>
      <fieldset class="quote-method quote-span"><legend>${esc(L.method)} <b>*</b></legend>${[['email',L.email],['phone',L.phone],['whatsapp',L.whatsapp]].map(([value,label])=>`<label><input type="radio" name="contactMethod" value="${value}" required><span>${esc(label)}</span></label>`).join('')}</fieldset>
      <label class="quote-field quote-span"><span>${esc(L.detail)} <b>*</b></span><input name="contact" type="text" autocomplete="off" required data-contact-input></label>
    </div></section>
    <section class="quote-step" data-quote-step="2" hidden><div class="quote-grid">
      <label class="quote-field"><span>${esc(L.origin)}</span><input name="origin" autocomplete="address-level2"></label>
      <label class="quote-field"><span>${esc(L.destination)}</span><input name="destination" autocomplete="address-level2"></label>
      <label class="quote-field quote-span"><span>${esc(L.date)}</span><input name="date" type="date"></label>
      <label class="quote-field quote-span quote-notes"><span>${esc(L.notes)}</span><textarea name="notes" rows="3" placeholder="${esc(L.placeholder)}"></textarea></label>
    </div></section>
    <section class="quote-step quote-review" data-quote-step="3" hidden><p>${esc(L.reviewLead)}</p><dl data-quote-review></dl></section>
    <div class="quote-action"><button type="button" class="quote-back" data-quote-back hidden>${esc(L.back)}</button><button type="button" data-quote-next>${esc(L.next)}</button><button type="submit" data-quote-submit hidden>${esc(L.submit)}</button><small>${esc(L.foot)}</small></div>
    <p class="quote-error" data-quote-error role="alert" aria-live="polite"></p>
  </form>`;
}

const storageKey = 'freight-quote-draft-v1';
const readDraft = () => { try { const value=JSON.parse(sessionStorage.getItem(storageKey) || '{}'); return value && typeof value==='object' && !Array.isArray(value) ? value : {}; } catch { return {}; } };
const writeDraft = (draft) => { try { sessionStorage.setItem(storageKey, JSON.stringify(draft)); } catch {} };

export function initQuoteForms(root = document) {
  if (!root?.querySelectorAll || root.documentElement?.dataset.quoteRuntime === 'ready') return;
  if (root.documentElement) root.documentElement.dataset.quoteRuntime = 'ready';
  const draft = readDraft();
  let step = Math.max(1, Math.min(3, Number(draft.__step) || 1));
  const copyFor = (form) => QUOTE_COPY[form.dataset.lang] ?? QUOTE_COPY.en;
  const save = (form) => { new FormData(form).forEach((value,key)=>{ draft[key]=String(value); }); draft.__step=step; writeDraft(draft); };
  const displayValue = (form, key, fallback = draft[key]) => {
    if (key === 'service') return form.elements.service?.selectedOptions?.[0]?.textContent || fallback;
    if (key === 'contactMethod') return [...form.querySelectorAll('input[name="contactMethod"]')]
      .find((input) => input.value === fallback)?.nextElementSibling?.textContent || fallback;
    return fallback;
  };
  const applyMethod = (form, value, reset = false) => {
    const input=form?.querySelector('[data-contact-input]'); if(!input||!value)return;
    const L=copyFor(form), email=value==='email'; input.type=email?'email':'tel'; input.inputMode=email?'email':'tel'; input.autocomplete=email?'email':'tel';
    if(email)input.removeAttribute('pattern'); else input.pattern='[+0-9 ()-]{7,}'; input.title=email?L.emailValidity:L.phoneValidity; input.placeholder=value==='whatsapp'?'+20 …':'';
    const words=input.closest('.quote-field')?.querySelector('span')?.firstChild; if(words?.nodeType===3)words.nodeValue=`${L.contactLabels[value] ?? ''} `;
    if(reset){input.value='';draft.contact='';writeDraft(draft);}
  };
  const paint = (form, next = step) => {
    step=Math.max(1,Math.min(3,next)); draft.__step=step; writeDraft(draft);
    form.querySelectorAll('[data-quote-step]').forEach((page)=>{page.hidden=Number(page.dataset.quoteStep)!==step;});
    form.querySelectorAll('[data-progress-step]').forEach((item)=>Number(item.dataset.progressStep)===step?item.setAttribute('aria-current','step'):item.removeAttribute('aria-current'));
    form.querySelector('[data-quote-back]').hidden=step===1; form.querySelector('[data-quote-next]').hidden=step===3; form.querySelector('[data-quote-submit]').hidden=step!==3;
    if(step===3){const L=copyFor(form),review=form.querySelector('[data-quote-review]');review.innerHTML=Object.entries(L.labels).map(([key,label])=>`<dt>${esc(label)}</dt><dd>${esc(displayValue(form,key)||L.missing)}</dd>`).join('');}
  };
  const hydrate = (form) => { if(form.dataset.quoteHydrated)return; form.dataset.quoteHydrated='true'; for(const [key,value] of Object.entries(draft)){const field=form.elements.namedItem(key);if(!field)continue;if(typeof RadioNodeList!=='undefined'&&field instanceof RadioNodeList)field.value=value;else field.value=value;}const select=form.elements.service;if(select&&draft.service&&!select.value){const legacy=[...select.options].find((option)=>option.textContent===draft.service);if(legacy){select.value=legacy.value;draft.service=legacy.value;writeDraft(draft);}}applyMethod(form,form.querySelector('input[name="contactMethod"]:checked')?.value);paint(form);};
  root.querySelectorAll('[data-quote-form]').forEach(hydrate);
  if(typeof MutationObserver!=='undefined')new MutationObserver((changes)=>changes.forEach((change)=>change.addedNodes.forEach((node)=>{if(!(node instanceof Element))return;if(node.matches('[data-quote-form]'))hydrate(node);node.querySelectorAll?.('[data-quote-form]').forEach(hydrate);}))).observe(root.body??root,{childList:true,subtree:true});
  root.addEventListener('input',(event)=>{const form=event.target.closest?.('[data-quote-form]');if(form)save(form);});
  root.addEventListener('change',(event)=>{const form=event.target.closest?.('[data-quote-form]');if(form)save(form);const method=event.target.closest?.('[data-quote-form] input[name="contactMethod"]');if(method)applyMethod(method.form,method.value,true);});
  root.addEventListener('click',(event)=>{const next=event.target.closest?.('[data-quote-next]'),back=event.target.closest?.('[data-quote-back]');if(!next&&!back)return;const form=event.target.closest('[data-quote-form]');if(back){paint(form,step-1);return;}const invalid=[...(form.querySelector(`[data-quote-step="${step}"]`)?.querySelectorAll('input,select,textarea')??[])].find((field)=>!field.checkValidity());if(invalid){invalid.reportValidity();invalid.focus();return;}save(form);paint(form,step+1);});
  root.addEventListener('submit',(event)=>{const form=event.target.closest?.('[data-quote-form]');if(!form)return;event.preventDefault();if(step<3){form.querySelector('[data-quote-next]')?.click();return;}save(form);const L=copyFor(form),error=form.querySelector('[data-quote-error]');if(!form.checkValidity()){form.reportValidity();if(error)error.textContent=L.invalid;return;}if(error)error.textContent=L.opening;const data=new FormData(form);const body=Object.entries(L.labels).map(([key,label])=>`${label}: ${displayValue(form,key,data.get(key))||L.missing}`).join('\n');location.href=`mailto:${encodeURIComponent(form.dataset.recipient)}?subject=${encodeURIComponent(L.subject)}&body=${encodeURIComponent(body)}`;});
}
