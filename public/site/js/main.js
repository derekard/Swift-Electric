// Swift Electric — site interactions
(function(){
  // ---- CONFIG: wire the contact form to your email service ----
  // Free option: create a key at https://web3forms.com (no account/server needed).
  // Paste it below. While it starts with "YOUR-", the form runs in demo mode.
  var ACCESS_KEY = "YOUR-WEB3FORMS-ACCESS-KEY";
  var ENDPOINT   = "https://api.web3forms.com/submit";

  // sticky nav shadow
  var navEl = document.querySelector('header.nav');
  if(navEl){
    var onScroll = function(){ navEl.classList.toggle('scrolled', window.scrollY > 20); };
    window.addEventListener('scroll', onScroll); onScroll();
  }
  // mobile menu
  var hamb = document.getElementById('hamb');
  var menu = document.getElementById('mobileMenu');
  if(hamb && menu){
    hamb.addEventListener('click', function(){ menu.classList.toggle('open'); });
    menu.querySelectorAll('a').forEach(function(a){ a.addEventListener('click', function(){ menu.classList.remove('open'); }); });
  }
  // scroll reveal
  if('IntersectionObserver' in window){
    var io = new IntersectionObserver(function(es){
      es.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } });
    },{threshold:.12, rootMargin:'0px 0px -50px 0px'});
    document.querySelectorAll('.reveal').forEach(function(el){ io.observe(el); });
  } else {
    document.querySelectorAll('.reveal').forEach(function(el){ el.classList.add('in'); });
  }

  // contact form
  var sendBtn = document.getElementById('sendBtn');
  if(sendBtn){
    var fields = document.getElementById('formFields');
    var ok = document.getElementById('okMsg');
    var errBox = document.getElementById('errMsg');
    var val = function(id){ var el=document.getElementById(id); return el ? el.value.trim() : ''; };
    var markInvalid = function(){
      [['name',val('name')],['phone',val('phone')]].forEach(function(p){
        var el=document.getElementById(p[0]); if(el) el.style.borderColor = p[1] ? '' : '#B4503E';
      });
    };
    var showOk = function(){ fields.classList.add('hide'); ok.classList.add('show'); };
    var showErr = function(){ if(errBox){ errBox.classList.add('show'); } };

    sendBtn.addEventListener('click', function(){
      if(errBox) errBox.classList.remove('show');
      var name=val('name'), phone=val('phone');
      if(!name || !phone){ markInvalid(); return; }

      var payload = {
        name:name, phone:phone, email:val('email'),
        service:val('service'), message:val('msg'),
        subject:'New quote request — '+name, from_name:'Swift Electric Website'
      };

      // demo mode (no key yet) — show success without sending
      if(ACCESS_KEY.indexOf('YOUR-') === 0){
        console.warn('[Swift Electric] Form is in demo mode. Set ACCESS_KEY in js/main.js to receive real submissions.');
        showOk(); return;
      }

      sendBtn.disabled = true; sendBtn.textContent = 'Sending…';
      payload.access_key = ACCESS_KEY;
      fetch(ENDPOINT, {
        method:'POST',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        body:JSON.stringify(payload)
      }).then(function(r){ return r.json(); })
        .then(function(d){ if(d && d.success){ showOk(); } else { showErr(); } })
        .catch(function(){ showErr(); })
        .finally(function(){ sendBtn.disabled=false; sendBtn.textContent='Send request'; });
    });
  }
})();
