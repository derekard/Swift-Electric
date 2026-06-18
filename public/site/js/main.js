// Swift Electric site interactions
(function(){
  var CONTACT_ENDPOINT = "/api/contact";

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
    var defaultErr = errBox ? errBox.textContent : 'Something went wrong sending your request.';
    var val = function(id){ var el=document.getElementById(id); return el ? el.value.trim() : ''; };
    var markInvalid = function(){
      var missing = false;
      [['name',val('name')],['phone',val('phone')]].forEach(function(p){
        if(!p[1]) missing = true;
        var el=document.getElementById(p[0]); if(el) el.style.borderColor = p[1] ? '' : '#B4503E';
      });
      return missing;
    };
    var showOk = function(){ fields.classList.add('hide'); ok.classList.add('show'); };
    var showErr = function(message){
      if(errBox){
        errBox.textContent = message || defaultErr;
        errBox.classList.add('show');
      }
    };

    sendBtn.addEventListener('click', function(){
      if(errBox) errBox.classList.remove('show');
      var name=val('name'), phone=val('phone');
      if(markInvalid()){ return; }

      var payload = {
        name:name,
        phone:phone,
        email:val('email'),
        service:val('service'),
        message:val('msg'),
        botcheck:val('botcheck')
      };

      sendBtn.disabled = true; sendBtn.textContent = 'Sending...';
      fetch(CONTACT_ENDPOINT, {
        method:'POST',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        body:JSON.stringify(payload)
      }).then(function(r){ return r.json().catch(function(){ return { success:false }; }); })
        .then(function(d){ if(d && d.success){ showOk(); } else { showErr(d && d.error); } })
        .catch(function(){ showErr(); })
        .finally(function(){ sendBtn.disabled=false; sendBtn.textContent='Send request'; });
    });
  }
})();
