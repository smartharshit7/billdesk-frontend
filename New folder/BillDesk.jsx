import { useState, useRef, useEffect, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG  — update BASE_URL to your running server, and GOOGLE_CLIENT_ID
// ─────────────────────────────────────────────────────────────────────────────
const BASE_URL         = "http://localhost:4000";
const GOOGLE_CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";

// ─────────────────────────────────────────────────────────────────────────────
// API CLIENT
// ─────────────────────────────────────────────────────────────────────────────
const api = {
  _t: ()  => localStorage.getItem("bd_token"),
  _h()    { return { "Content-Type":"application/json", Authorization:`Bearer ${this._t()}` }; },
  async post(p,b)  { const r=await fetch(`${BASE_URL}${p}`,{method:"POST",  headers:this._h(),body:JSON.stringify(b)}); const d=await r.json(); if(!r.ok) throw new Error(d.error||"Request failed"); return d; },
  async get(p)     { const r=await fetch(`${BASE_URL}${p}`,{headers:this._h()});                                        const d=await r.json(); if(!r.ok) throw new Error(d.error||"Request failed"); return d; },
  async put(p,b)   { const r=await fetch(`${BASE_URL}${p}`,{method:"PUT",   headers:this._h(),body:JSON.stringify(b)}); const d=await r.json(); if(!r.ok) throw new Error(d.error||"Request failed"); return d; },
  async del(p)     { const r=await fetch(`${BASE_URL}${p}`,{method:"DELETE",headers:this._h()});                        const d=await r.json(); if(!r.ok) throw new Error(d.error||"Request failed"); return d; },
  async postGoogleCred(credential) { return this.post("/api/auth/google", { credential }); },
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const fmt  = n => Number(n||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtQ = n => Number(n||0)%1===0?String(Number(n||0)):Number(n||0).toFixed(2);
const uid  = () => `INV-${Date.now().toString().slice(-7)}`;
const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const validPhone = p => /^[6-9]\d{9}$/.test(p.replace(/\s/g,""));

function getStock(pid, ledger=[]) {
  return ledger.filter(e=>e.productId===pid||e.productId?._id===pid).reduce((s,e)=>s+(e.type==="in"?e.qty:-e.qty),0);
}
function stockStatus(stock, low=5) {
  if(stock<=0)   return {label:"Out of stock",c:"#e05252",bg:"#e0525218"};
  if(stock<=low) return {label:"Low stock",   c:"#f0a500",bg:"#f0a50018"};
  return               {label:"In stock",    c:"#43c59e",bg:"#43c59e18"};
}

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────────────────────────────────────
const lbl  = {display:"block",color:"#7a7d8f",fontSize:12,marginBottom:6,fontWeight:500};
const inp  = {background:"#0f1117",border:"1px solid #2a2d3a",borderRadius:8,padding:"10px 12px",color:"#e8e9f0",fontSize:14,width:"100%",outline:"none",fontFamily:"inherit",transition:"border .2s"};
const card = (bg) => ({background:bg||"#181a23",border:"1px solid #2a2d3a",borderRadius:12,padding:20});
const btn  = (bg,c,x={}) => ({display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,padding:"10px 18px",borderRadius:8,border:"none",background:bg,color:c,cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:500,...x});

const G_CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',sans-serif}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#2a2d3a;border-radius:4px}
input,select,button,textarea{font-family:'DM Sans',sans-serif}
input:focus,select:focus,textarea:focus{border-color:#7c6af7!important;outline:none}
input[type=number]::-webkit-inner-spin-button{opacity:.4}
input[type=date]::-webkit-calendar-picker-indicator{filter:invert(.4)}
select{appearance:none;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%237a7d8f' stroke-width='1.5' fill='none'/%3E%3C/svg%3E");
  background-repeat:no-repeat;background-position:right 12px center;padding-right:32px!important}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.fade-in{animation:fadeIn .25s ease forwards}
`;

// ─────────────────────────────────────────────────────────────────────────────
// SPINNER
// ─────────────────────────────────────────────────────────────────────────────
function Spinner({msg="Loading…",full=true}) {
  return (
    <div style={full?{minHeight:"100vh",background:"#0f1117",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14}:{display:"flex",alignItems:"center",gap:10,padding:"16px 0",justifyContent:"center"}}>
      <div style={{width:32,height:32,border:"3px solid #2a2d3a",borderTopColor:"#7c6af7",borderRadius:"50%",animation:"spin .7s linear infinite"}}/>
      {msg&&<p style={{color:"#7a7d8f",fontSize:14}}>{msg}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE SIGN-IN BUTTON  (loads GSI script, renders real Google button)
// ─────────────────────────────────────────────────────────────────────────────
function GoogleSignInBtn({onSuccess, onError, label="Sign in with Google"}) {
  const divRef = useRef();
  const [loaded, setLoaded] = useState(!!window.google);

  useEffect(()=>{
    if(window.google){ initGoogle(); return; }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = () => { setLoaded(true); initGoogle(); };
    s.onerror = () => onError?.("Failed to load Google Sign-In.");
    document.head.appendChild(s);
  },[]);

  function initGoogle() {
    if(!window.google||!divRef.current) return;
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (res) => {
        try {
          const d = await api.postGoogleCred(res.credential);
          localStorage.setItem("bd_token", d.token);
          onSuccess(d.user);
        } catch(e){ onError?.(e.message); }
      },
    });
    window.google.accounts.id.renderButton(divRef.current, {
      theme:"filled_black", size:"large", width:320, text: label==="Sign in with Google"?"signin_with":"signup_with",
    });
  }

  if(GOOGLE_CLIENT_ID.includes("YOUR_GOOGLE"))
    return (
      <div style={{background:"#1e2030",border:"1px dashed #2a2d3a",borderRadius:8,padding:"10px 14px",textAlign:"center"}}>
        <p style={{color:"#7a7d8f",fontSize:12}}>⚙ Google Sign-In disabled</p>
        <p style={{color:"#7a7d8f",fontSize:11,marginTop:2}}>Set <code style={{color:"#7c6af7"}}>GOOGLE_CLIENT_ID</code> in the app config</p>
      </div>
    );

  return <div ref={divRef} style={{minHeight:44,display:"flex",justifyContent:"center"}}/>;
}

// ─────────────────────────────────────────────────────────────────────────────
// FORGOT PASSWORD SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function ForgotPasswordScreen({onBack}) {
  const [email,   setEmail]   = useState("");
  const [status,  setStatus]  = useState("idle"); // idle | sent | error
  const [msg,     setMsg]     = useState("");
  const [busy,    setBusy]    = useState(false);

  const send = async () => {
    if(!email.trim()||!validEmail(email)){setMsg("Enter a valid email.");setStatus("error");return;}
    setBusy(true); setMsg(""); setStatus("idle");
    try {
      const d = await api.post("/api/auth/forgot-password",{email});
      setMsg(d.message||"Reset link sent!");
      setStatus("sent");
    } catch(e){ setMsg(e.message); setStatus("error"); }
    finally{ setBusy(false); }
  };

  return (
    <div style={{minHeight:"100vh",background:"#0f1117",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <style>{G_CSS}</style>
      <div style={{...card(),borderRadius:16,padding:"40px 36px",width:400}} className="fade-in">
        <button onClick={onBack} style={{background:"transparent",border:"none",color:"#7a7d8f",cursor:"pointer",fontSize:13,fontFamily:"inherit",marginBottom:20,display:"flex",alignItems:"center",gap:6,padding:0}}>
          ← Back to Sign In
        </button>

        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{width:52,height:52,background:"#7c6af720",borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",fontSize:26}}>🔐</div>
          <h2 style={{color:"#e8e9f0",fontSize:20,fontWeight:600}}>Forgot Password?</h2>
          <p style={{color:"#7a7d8f",fontSize:13,marginTop:6,lineHeight:1.5}}>Enter your registered email and we'll send you a reset link.</p>
        </div>

        {status==="sent" ? (
          <div style={{background:"#43c59e18",border:"1px solid #43c59e30",borderRadius:10,padding:"18px 16px",textAlign:"center"}}>
            <div style={{fontSize:28,marginBottom:8}}>📬</div>
            <p style={{color:"#43c59e",fontSize:14,fontWeight:500}}>Check your inbox!</p>
            <p style={{color:"#7a7d8f",fontSize:13,marginTop:6}}>{msg}</p>
            <button onClick={onBack} style={{...btn("#7c6af7","#fff",{marginTop:18,padding:"9px 20px",fontSize:13})}}>Back to Sign In</button>
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div>
              <label style={lbl}>Registered Email *</label>
              <input style={inp} type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder="you@example.com" autoFocus/>
            </div>
            {msg && status==="error" && <p style={{color:"#e05252",fontSize:12}}>{msg}</p>}
            <button onClick={send} disabled={busy} style={{...btn("#7c6af7","#fff",{width:"100%",padding:12,opacity:busy?.6:1})}}>
              {busy?"Sending…":"Send Reset Link"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RESET PASSWORD SCREEN  (shown when ?resetToken=xxx is in URL)
// ─────────────────────────────────────────────────────────────────────────────
function ResetPasswordScreen({token, onDone}) {
  const [pw,      setPw]      = useState("");
  const [pw2,     setPw2]     = useState("");
  const [busy,    setBusy]    = useState(false);
  const [valid,   setValid]   = useState(null); // null=checking, true, false
  const [done,    setDone]    = useState(false);
  const [err,     setErr]     = useState("");

  useEffect(()=>{
    api.get(`/api/auth/validate-reset-token/${token}`)
      .then(d=>setValid(d.valid))
      .catch(()=>setValid(false));
  },[token]);

  const reset = async () => {
    if(pw.length<6){setErr("Password must be at least 6 characters.");return;}
    if(pw!==pw2){setErr("Passwords don't match.");return;}
    setBusy(true); setErr("");
    try {
      await api.post("/api/auth/reset-password",{token,newPassword:pw});
      setDone(true);
    } catch(e){ setErr(e.message); } finally{ setBusy(false); }
  };

  if(valid===null) return <Spinner msg="Validating reset link…"/>;

  return (
    <div style={{minHeight:"100vh",background:"#0f1117",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <style>{G_CSS}</style>
      <div style={{...card(),borderRadius:16,padding:"40px 36px",width:400}} className="fade-in">
        {!valid ? (
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:40,marginBottom:12}}>⛔</div>
            <h2 style={{color:"#e8e9f0",fontSize:18,fontWeight:600,marginBottom:8}}>Link Expired</h2>
            <p style={{color:"#7a7d8f",fontSize:13,lineHeight:1.5}}>This reset link is invalid or has expired. Reset links are valid for 1 hour.</p>
            <button onClick={onDone} style={{...btn("#7c6af7","#fff",{marginTop:20,padding:"10px 24px"})}}>Back to Sign In</button>
          </div>
        ) : done ? (
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:40,marginBottom:12}}>✅</div>
            <h2 style={{color:"#e8e9f0",fontSize:18,fontWeight:600,marginBottom:8}}>Password Reset!</h2>
            <p style={{color:"#7a7d8f",fontSize:13}}>Your password has been updated. You can now sign in.</p>
            <button onClick={onDone} style={{...btn("#7c6af7","#fff",{marginTop:20,padding:"10px 24px"})}}>Sign In →</button>
          </div>
        ) : (
          <>
            <div style={{textAlign:"center",marginBottom:24}}>
              <div style={{width:52,height:52,background:"#7c6af720",borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",fontSize:26}}>🔑</div>
              <h2 style={{color:"#e8e9f0",fontSize:20,fontWeight:600}}>Set New Password</h2>
              <p style={{color:"#7a7d8f",fontSize:13,marginTop:4}}>Choose a strong new password for your account.</p>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div>
                <label style={lbl}>New Password *</label>
                <input style={inp} type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="Min. 6 characters"/>
              </div>
              <div>
                <label style={lbl}>Confirm Password *</label>
                <input style={inp} type="password" value={pw2} onChange={e=>setPw2(e.target.value)} onKeyDown={e=>e.key==="Enter"&&reset()} placeholder="Repeat password"/>
              </div>
              {/* Strength indicator */}
              {pw && (
                <div style={{display:"flex",gap:4}}>
                  {[...Array(4)].map((_,i)=>{
                    const strength = pw.length>=8&&/[A-Z]/.test(pw)&&/\d/.test(pw)&&/[^A-Za-z0-9]/.test(pw)?4:pw.length>=6&&(/[A-Z]/.test(pw)||/\d/.test(pw))?3:pw.length>=6?2:1;
                    const colors=["#e05252","#f0a500","#43c59e","#7c6af7"];
                    return <div key={i} style={{flex:1,height:3,borderRadius:2,background:i<strength?colors[strength-1]:"#2a2d3a",transition:"background .3s"}}/>;
                  })}
                  <span style={{fontSize:11,color:"#7a7d8f",marginLeft:6}}>{pw.length<6?"Weak":pw.length>=8&&/[A-Z]/.test(pw)&&/\d/.test(pw)?"Strong":"OK"}</span>
                </div>
              )}
              {err && <p style={{color:"#e05252",fontSize:12}}>{err}</p>}
              <button onClick={reset} disabled={busy} style={{...btn("#7c6af7","#fff",{width:"100%",padding:12,opacity:busy?.6:1})}}>
                {busy?"Resetting…":"Reset Password"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH SCREEN  — login / register + shop setup
// ─────────────────────────────────────────────────────────────────────────────
function AuthScreen({onLogin, initialResetToken}) {
  const [mode,  setMode]  = useState("login");   // login | register
  const [step,  setStep]  = useState(1);          // 1=creds, 2=shop
  const [screen,setScreen]= useState(initialResetToken?"reset":initialResetToken==="forgot"?"forgot":"auth");
  const [resetTok,setResetTok] = useState(initialResetToken||"");

  // Form state
  const [f,    setF]  = useState({username:"",email:"",phone:"",password:"",confirmPassword:""});
  const [shop, setS_] = useState({name:"",tagline:"",phone:"",email:"",address:"",gstin:"",logo:""});
  const [err,  setErr]= useState("");
  const [busy, setBusy]=useState(false);
  const [gErr, setGErr]=useState("");
  const logoRef = useRef();

  const setFld = (k,v) => setF(p=>({...p,[k]:v}));
  const setSh  = (k,v) => setS_(p=>({...p,[k]:v}));

  if(screen==="forgot") return <ForgotPasswordScreen onBack={()=>setScreen("auth")}/>;
  if(screen==="reset")  return <ResetPasswordScreen  token={resetTok} onDone={()=>setScreen("auth")}/>;

  // ── Validate registration step 1 ──────────────────────────────────
  const validateCreds = () => {
    if(!f.username.trim())        return "Username is required.";
    if(f.username.length<3)       return "Username must be at least 3 characters.";
    if(!f.email.trim())           return "Email is required.";
    if(!validEmail(f.email))      return "Enter a valid email address.";
    if(!f.phone.trim())           return "Phone number is required.";
    if(!validPhone(f.phone))      return "Enter a valid 10-digit Indian mobile number.";
    if(!f.password)               return "Password is required.";
    if(f.password.length<6)       return "Password must be at least 6 characters.";
    if(f.password!==f.confirmPassword) return "Passwords do not match.";
    return null;
  };

  const submitCreds = async () => {
    setErr("");
    if(mode==="login") {
      if(!f.username.trim()||!f.password) { setErr("Fill all fields."); return; }
      setBusy(true);
      try {
        const d = await api.post("/api/login",{username:f.username,password:f.password});
        localStorage.setItem("bd_token",d.token);
        onLogin(d.user);
      } catch(e){ setErr(e.message); } finally{ setBusy(false); }
    } else {
      const e = validateCreds();
      if(e){ setErr(e); return; }
      setStep(2);
    }
  };

  const submitShop = async () => {
    if(!shop.name.trim()){ setErr("Shop name is required."); return; }
    setBusy(true); setErr("");
    try {
      const d = await api.post("/api/register",{
        username: f.username, password: f.password,
        email: f.email, phone: f.phone, shop
      });
      localStorage.setItem("bd_token",d.token);
      onLogin(d.user);
    } catch(e){ setErr(e.message); setBusy(false); }
  };

  const handleLogo = e => {
    const file=e.target.files[0]; if(!file) return;
    const r=new FileReader(); r.onload=ev=>setSh("logo",ev.target.result); r.readAsDataURL(file);
  };

  // ── Shop setup step ────────────────────────────────────────────────
  if(step===2) return (
    <div style={{minHeight:"100vh",background:"#0f1117",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <style>{G_CSS}</style>
      <div style={{...card(),borderRadius:16,padding:"36px",width:"100%",maxWidth:520,maxHeight:"92vh",overflowY:"auto"}} className="fade-in">
        <button onClick={()=>setStep(1)} style={{background:"transparent",border:"none",color:"#7a7d8f",cursor:"pointer",fontSize:13,fontFamily:"inherit",marginBottom:16,display:"flex",alignItems:"center",gap:5,padding:0}}>← Back</button>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:32,marginBottom:8}}>🏪</div>
          <h2 style={{color:"#e8e9f0",fontSize:20,fontWeight:600}}>Set up your shop</h2>
          <p style={{color:"#7a7d8f",fontSize:13,marginTop:4}}>This info appears on every invoice you print</p>
        </div>

        {/* Logo */}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,marginBottom:20}}>
          <div onClick={()=>logoRef.current.click()} style={{width:76,height:76,borderRadius:14,border:"2px dashed #2a2d3a",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",overflow:"hidden",background:"#0f1117",transition:"border .2s"}}
            onMouseEnter={e=>e.currentTarget.style.borderColor="#7c6af7"}
            onMouseLeave={e=>e.currentTarget.style.borderColor="#2a2d3a"}>
            {shop.logo?<img src={shop.logo} style={{width:"100%",height:"100%",objectFit:"cover"}} alt="logo"/>:<span style={{fontSize:28,color:"#7a7d8f"}}>+</span>}
          </div>
          <p style={{color:"#7a7d8f",fontSize:12}}>Click to upload shop logo (optional)</p>
          <input ref={logoRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleLogo}/>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div style={{gridColumn:"1/-1"}}><label style={lbl}>Shop Name *</label><input style={inp} value={shop.name} onChange={e=>setSh("name",e.target.value)} placeholder="e.g. Sharma General Store"/></div>
          <div style={{gridColumn:"1/-1"}}><label style={lbl}>Tagline</label><input style={inp} value={shop.tagline} onChange={e=>setSh("tagline",e.target.value)} placeholder="Quality you can trust"/></div>
          <div><label style={lbl}>Phone</label><input style={inp} value={shop.phone} onChange={e=>setSh("phone",e.target.value)} placeholder="+91 98765 43210"/></div>
          <div><label style={lbl}>Email</label><input style={inp} value={shop.email} onChange={e=>setSh("email",e.target.value)} placeholder="shop@example.com"/></div>
          <div style={{gridColumn:"1/-1"}}><label style={lbl}>Address</label><textarea style={{...inp,resize:"vertical",minHeight:58}} value={shop.address} onChange={e=>setSh("address",e.target.value)} placeholder="Full shop address"/></div>
          <div style={{gridColumn:"1/-1"}}><label style={lbl}>GSTIN</label><input style={inp} value={shop.gstin} onChange={e=>setSh("gstin",e.target.value)} placeholder="22AAAAA0000A1Z5"/></div>
        </div>
        {err&&<p style={{color:"#e05252",fontSize:12,marginTop:10}}>{err}</p>}
        <button onClick={submitShop} disabled={busy} style={{...btn("#7c6af7","#fff",{width:"100%",padding:12,marginTop:18,opacity:busy?.6:1})}}>
          {busy?"Creating account…":"Launch BillDesk →"}
        </button>
      </div>
    </div>
  );

  // ── Main auth card ─────────────────────────────────────────────────
  return (
    <div style={{minHeight:"100vh",background:"#0f1117",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <style>{G_CSS}</style>
      <div style={{...card(),borderRadius:16,padding:"40px 36px",width:"100%",maxWidth:420,maxHeight:"95vh",overflowY:"auto"}} className="fade-in">

        {/* Logo + title */}
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{width:54,height:54,background:"#7c6af720",borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",fontSize:28}}>🧾</div>
          <h1 style={{color:"#e8e9f0",fontSize:22,fontWeight:600}}>BillDesk</h1>
          <p style={{color:"#7a7d8f",fontSize:13,marginTop:4}}>Smart billing & inventory for your shop</p>
        </div>

        {/* Tab toggle */}
        <div style={{display:"flex",background:"#0f1117",borderRadius:8,padding:4,marginBottom:22}}>
          {["login","register"].map(m=>(
            <button key={m} onClick={()=>{setMode(m);setErr("");setStep(1);}} style={{flex:1,padding:"7px 0",borderRadius:6,border:"none",background:mode===m?"#7c6af7":"transparent",color:mode===m?"#fff":"#7a7d8f",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:500,transition:"all .2s"}}>
              {m==="login"?"Sign In":"Register"}
            </button>
          ))}
        </div>

        {/* ── Google button ── */}
        <div style={{marginBottom:16}}>
          <GoogleSignInBtn
            onSuccess={onLogin}
            onError={setGErr}
            label={mode==="login"?"Sign in with Google":"Sign up with Google"}
          />
          {gErr && <p style={{color:"#e05252",fontSize:12,marginTop:6,textAlign:"center"}}>{gErr}</p>}
        </div>

        {/* Divider */}
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
          <div style={{flex:1,height:"1px",background:"#2a2d3a"}}/>
          <span style={{color:"#7a7d8f",fontSize:12}}>or continue with email</span>
          <div style={{flex:1,height:"1px",background:"#2a2d3a"}}/>
        </div>

        {/* ── Fields ── */}
        <div style={{display:"flex",flexDirection:"column",gap:12}}>

          {/* Username */}
          <div>
            <label style={lbl}>Username *</label>
            <input style={inp} value={f.username} onChange={e=>setFld("username",e.target.value)} placeholder="your_username"/>
          </div>

          {/* Email (always shown) */}
          <div>
            <label style={lbl}>{mode==="register"?"Email Address *":"Email or Username"}</label>
            <input style={{...inp,borderColor:f.email&&!validEmail(f.email)?"#e05252":"#2a2d3a"}}
              type={mode==="register"?"email":"text"}
              value={f.email}
              onChange={e=>setFld("email",e.target.value)}
              placeholder={mode==="register"?"you@example.com":"username or email"}/>
            {mode==="register"&&f.email&&!validEmail(f.email)&&<p style={{color:"#e05252",fontSize:11,marginTop:4}}>Invalid email format</p>}
          </div>

          {/* Phone — only on register */}
          {mode==="register" && (
            <div>
              <label style={lbl}>Mobile Number * <span style={{color:"#7a7d8f",fontWeight:400}}>(must be unique)</span></label>
              <div style={{display:"flex",gap:8}}>
                <span style={{...inp,width:"auto",padding:"10px 12px",color:"#7a7d8f",whiteSpace:"nowrap",flexShrink:0}}>+91</span>
                <input style={{...inp,borderColor:f.phone&&!validPhone(f.phone)?"#e05252":"#2a2d3a"}}
                  type="tel" value={f.phone} onChange={e=>setFld("phone",e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="10-digit mobile number" maxLength={10}/>
              </div>
              {f.phone&&!validPhone(f.phone)&&<p style={{color:"#e05252",fontSize:11,marginTop:4}}>Enter a valid 10-digit number</p>}
            </div>
          )}

          {/* Password */}
          <div>
            <label style={lbl}>Password *</label>
            <input style={inp} type="password" value={f.password} onChange={e=>setFld("password",e.target.value)} placeholder="••••••••"/>
            {/* Strength bar on register */}
            {mode==="register"&&f.password&&(()=>{
              const s=f.password.length>=8&&/[A-Z]/.test(f.password)&&/\d/.test(f.password)?3:f.password.length>=6?2:1;
              const cols=["#e05252","#f0a500","#43c59e"];
              const labs=["Weak","Fair","Strong"];
              return (
                <div style={{display:"flex",gap:4,marginTop:6,alignItems:"center"}}>
                  {[0,1,2].map(i=><div key={i} style={{flex:1,height:3,borderRadius:2,background:i<s?cols[s-1]:"#2a2d3a"}}/>)}
                  <span style={{color:cols[s-1],fontSize:11,marginLeft:6}}>{labs[s-1]}</span>
                </div>
              );
            })()}
          </div>

          {/* Confirm password — only register */}
          {mode==="register" && (
            <div>
              <label style={lbl}>Confirm Password *</label>
              <input style={{...inp,borderColor:f.confirmPassword&&f.confirmPassword!==f.password?"#e05252":"#2a2d3a"}}
                type="password" value={f.confirmPassword} onChange={e=>setFld("confirmPassword",e.target.value)} placeholder="Repeat password"/>
              {f.confirmPassword&&f.confirmPassword!==f.password&&<p style={{color:"#e05252",fontSize:11,marginTop:4}}>Passwords don't match</p>}
            </div>
          )}

          {err && <p style={{color:"#e05252",fontSize:12,padding:"8px 12px",background:"#e0525218",borderRadius:7}}>{err}</p>}

          {/* Submit */}
          <button onClick={submitCreds} disabled={busy} style={{...btn("#7c6af7","#fff",{width:"100%",padding:12,marginTop:2,opacity:busy?.6:1})}}>
            {busy?"Please wait…":mode==="login"?"Sign In →":"Continue →"}
          </button>

          {/* Forgot password — login only */}
          {mode==="login" && (
            <button onClick={()=>setScreen("forgot")} style={{background:"transparent",border:"none",color:"#7c6af7",cursor:"pointer",fontSize:13,fontFamily:"inherit",textDecoration:"underline",padding:0,textAlign:"center"}}>
              Forgot your password?
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PRINT INVOICE
// ─────────────────────────────────────────────────────────────────────────────
function PrintInvoice({invoice, shop, onClose}) {
  const logoSrc = shop.logo && !shop.logo.startsWith("http") && !shop.logo.startsWith("data:") ? `${BASE_URL}${shop.logo}` : shop.logo;

  const printBill = () => {
    const win = window.open("","_blank","width=850,height=950");
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Invoice ${invoice.invoiceNo}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&display=swap');
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'DM Sans',sans-serif;background:#fff;color:#1a1a2e}
      .page{max-width:780px;margin:0 auto;padding:48px 48px 60px}
      .hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:36px;padding-bottom:28px;border-bottom:2px solid #f0f0f0}
      .logo{width:72px;height:72px;object-fit:contain;border-radius:10px}
      .logo-ph{width:72px;height:72px;border-radius:10px;background:#f5f3ff;display:flex;align-items:center;justify-content:center;font-size:28px}
      .shop-name{font-size:24px;font-weight:600;color:#1a1a2e;margin-bottom:4px}
      .shop-tag{font-size:13px;color:#666;margin-bottom:10px}
      .shop-meta{font-size:12px;color:#555;line-height:1.8}
      .inv-badge{text-align:right}
      .inv-title{font-size:28px;font-weight:600;color:#7c6af7;letter-spacing:-.5px}
      .inv-no{font-size:13px;color:#666;margin-top:4px}
      .inv-date{font-size:13px;color:#666;margin-top:2px}
      .parties{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:32px}
      .p-box{background:#fafafa;border-radius:10px;padding:16px 18px}
      .p-label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#999;margin-bottom:8px}
      .p-name{font-size:15px;font-weight:500;color:#1a1a2e;margin-bottom:4px}
      .p-meta{font-size:12px;color:#666;line-height:1.7}
      table{width:100%;border-collapse:collapse;margin-bottom:24px}
      thead tr{background:#f5f3ff}
      th{padding:11px 14px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:#7c6af7}
      td{padding:11px 14px;font-size:13px;color:#2a2a3e;border-bottom:1px solid #f0f0f0}
      td:nth-child(n+3){text-align:right;color:#555}
      th:nth-child(n+3){text-align:right}
      tbody tr:last-child td{border-bottom:none}
      .totals{display:flex;justify-content:flex-end}
      .tot-box{width:268px}
      .tot-row{display:flex;justify-content:space-between;padding:7px 0;font-size:13px;color:#555;border-bottom:1px solid #f5f5f5}
      .tot-label{color:#888}
      .disc-row{color:#e05252}.disc-row .tot-label{color:#e05252}
      .grand{display:flex;justify-content:space-between;padding:14px 18px;background:#f5f3ff;border-radius:10px;margin-top:8px}
      .grand-label{font-size:15px;font-weight:600;color:#7c6af7}
      .grand-val{font-size:18px;font-weight:700;color:#7c6af7}
      .footer{margin-top:48px;padding-top:20px;border-top:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:flex-end}
      .thanks{font-size:13px;color:#888}
      .gstin-note{font-size:11px;color:#aaa;margin-top:4px}
      .sig-line{width:140px;border-top:1px solid #ccc;padding-top:6px;font-size:11px;color:#aaa;text-align:center}
      .gst-chip{font-size:10px;background:#ecfdf5;color:#059669;padding:2px 7px;border-radius:4px}
      .no-gst{font-size:10px;background:#f5f5f5;color:#999;padding:2px 7px;border-radius:4px}
    </style></head><body><div class="page">
      <div class="hdr">
        <div style="display:flex;gap:18px;align-items:flex-start">
          ${logoSrc?`<img src="${logoSrc}" class="logo" onerror="this.style.display='none'"/>`:`<div class="logo-ph">🏪</div>`}
          <div>
            <div class="shop-name">${shop.name||"Your Shop"}</div>
            ${shop.tagline?`<div class="shop-tag">${shop.tagline}</div>`:""}
            <div class="shop-meta">
              ${shop.phone?`📞 ${shop.phone}<br>`:""}
              ${shop.email?`✉ ${shop.email}<br>`:""}
              ${shop.address?`📍 ${shop.address}<br>`:""}
              ${shop.gstin?`GSTIN: ${shop.gstin}`:""}
            </div>
          </div>
        </div>
        <div class="inv-badge">
          <div class="inv-title">INVOICE</div>
          <div class="inv-no"># ${invoice.invoiceNo}</div>
          <div class="inv-date">Date: ${invoice.date}</div>
        </div>
      </div>
      <div class="parties">
        <div class="p-box">
          <div class="p-label">Billed To</div>
          <div class="p-name">${invoice.customer?.name||"—"}</div>
          <div class="p-meta">${invoice.customer?.phone?`Phone: ${invoice.customer.phone}<br>`:""}${invoice.customer?.address||""}</div>
        </div>
        <div class="p-box">
          <div class="p-label">Invoice Info</div>
          <div class="p-meta">Invoice No: <strong>${invoice.invoiceNo}</strong><br>Date: ${invoice.date}<br>Items: ${invoice.items.length}</div>
        </div>
      </div>
      <table>
        <thead><tr><th>#</th><th>Product</th><th>Qty</th><th>Rate (₹)</th><th>GST</th><th>Amount (₹)</th></tr></thead>
        <tbody>
          ${invoice.items.map((it,i)=>{
            const b=it.qty*it.rate; const g=it.gstApplicable?b*it.gstRate/100:0;
            return `<tr><td style="color:#aaa">${i+1}</td><td>${it.name} <span style="color:#aaa;font-size:11px">(${it.unit})</span></td><td>${fmtQ(it.qty)}</td><td>₹${fmt(it.rate)}</td><td>${it.gstApplicable?`<span class="gst-chip">${it.gstRate}%</span>`:`<span class="no-gst">Exempt</span>`}</td><td style="font-weight:500">₹${fmt(b+g)}</td></tr>`;
          }).join("")}
        </tbody>
      </table>
      <div class="totals"><div class="tot-box">
        <div class="tot-row"><span class="tot-label">Subtotal</span><span>₹${fmt(invoice.subtotal)}</span></div>
        <div class="tot-row"><span class="tot-label">GST</span><span>₹${fmt(invoice.gstTotal)}</span></div>
        ${invoice.discount>0?`<div class="tot-row disc-row"><span class="tot-label">Discount${invoice.discountType==="percent"?` (${invoice.discount}%)`:" (flat)"}</span><span>-₹${fmt(invoice.discountType==="percent"?(invoice.subtotal+invoice.gstTotal)*invoice.discount/100:invoice.discount)}</span></div>`:""}
        <div class="grand"><span class="grand-label">Total Amount</span><span class="grand-val">₹${fmt(invoice.total)}</span></div>
      </div></div>
      <div class="footer">
        <div><div class="thanks">Thank you for your business! 🙏</div>${shop.gstin?`<div class="gstin-note">GSTIN: ${shop.gstin}</div>`:""}</div>
        <div class="sig-line">Authorised Signature</div>
      </div>
    </div></body></html>`);
    win.document.close();
    setTimeout(()=>{win.focus();win.print();win.close();},600);
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.78)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:24}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{...card("#1a1c28"),borderRadius:16,padding:0,width:"100%",maxWidth:700,maxHeight:"92vh",overflowY:"auto"}}>
        <div style={{padding:"16px 24px",borderBottom:"1px solid #2a2d3a",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <h3 style={{color:"#e8e9f0",fontSize:15,fontWeight:500}}>Preview — {invoice.invoiceNo}</h3>
          <div style={{display:"flex",gap:8}}>
            <button onClick={printBill} style={{...btn("#7c6af7","#fff",{padding:"8px 16px",fontSize:13})}}>🖨 Print / PDF</button>
            <button onClick={onClose}   style={{...btn("transparent","#7a7d8f",{padding:"8px 14px",fontSize:13,border:"1px solid #2a2d3a"})}}>✕</button>
          </div>
        </div>
        <div style={{padding:24,background:"#fff",margin:20,borderRadius:12,color:"#1a1a2e"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24,paddingBottom:18,borderBottom:"2px solid #f0f0f0"}}>
            <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
              {logoSrc?<img src={logoSrc} style={{width:64,height:64,objectFit:"contain",borderRadius:10}} alt="logo" onError={e=>{e.target.style.display="none"}}/>:<div style={{width:64,height:64,borderRadius:10,background:"#f5f3ff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26}}>🏪</div>}
              <div>
                <div style={{fontSize:20,fontWeight:600}}>{shop.name||"Your Shop"}</div>
                {shop.tagline&&<div style={{fontSize:12,color:"#666",marginTop:2}}>{shop.tagline}</div>}
                <div style={{fontSize:12,color:"#555",marginTop:6,lineHeight:1.7}}>
                  {shop.phone&&<div>📞 {shop.phone}</div>}
                  {shop.email&&<div>✉ {shop.email}</div>}
                  {shop.address&&<div>📍 {shop.address}</div>}
                  {shop.gstin&&<div>GSTIN: {shop.gstin}</div>}
                </div>
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:24,fontWeight:600,color:"#7c6af7"}}>INVOICE</div>
              <div style={{fontSize:12,color:"#666",marginTop:4}}>#{invoice.invoiceNo}</div>
              <div style={{fontSize:12,color:"#666",marginTop:2}}>{invoice.date}</div>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:20}}>
            {[{label:"Billed To",name:invoice.customer?.name,meta:[invoice.customer?.phone&&`Phone: ${invoice.customer.phone}`,invoice.customer?.address].filter(Boolean)},
              {label:"Invoice Info",meta:[`Invoice: ${invoice.invoiceNo}`,`Date: ${invoice.date}`,`Items: ${invoice.items.length}`]}].map((p,i)=>(
              <div key={i} style={{background:"#fafafa",borderRadius:10,padding:"14px 16px"}}>
                <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:1,color:"#999",marginBottom:6}}>{p.label}</div>
                {p.name&&<div style={{fontSize:14,fontWeight:500,color:"#1a1a2e",marginBottom:4}}>{p.name}</div>}
                <div style={{fontSize:12,color:"#666",lineHeight:1.8}}>{p.meta.map((m,j)=><div key={j}>{m}</div>)}</div>
              </div>
            ))}
          </div>
          <table style={{width:"100%",borderCollapse:"collapse",marginBottom:18}}>
            <thead><tr style={{background:"#f5f3ff"}}>
              {["#","Product","Qty","Rate (₹)","GST","Amount (₹)"].map(h=><th key={h} style={{padding:"10px 12px",textAlign:"left",fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:.6,color:"#7c6af7"}}>{h}</th>)}
            </tr></thead>
            <tbody>
              {invoice.items.map((it,i)=>{const b=it.qty*it.rate;const g=it.gstApplicable?b*it.gstRate/100:0;return(
                <tr key={i} style={{borderBottom:"1px solid #f0f0f0"}}>
                  <td style={{padding:"10px 12px",color:"#aaa",fontSize:12}}>{i+1}</td>
                  <td style={{padding:"10px 12px",fontSize:13}}>{it.name} <span style={{color:"#aaa",fontSize:11}}>({it.unit})</span></td>
                  <td style={{padding:"10px 12px",textAlign:"right",color:"#555",fontSize:13}}>{fmtQ(it.qty)}</td>
                  <td style={{padding:"10px 12px",textAlign:"right",color:"#555",fontSize:13}}>₹{fmt(it.rate)}</td>
                  <td style={{padding:"10px 12px",textAlign:"right"}}>
                    {it.gstApplicable?<span style={{fontSize:11,background:"#ecfdf5",color:"#059669",padding:"2px 7px",borderRadius:4}}>{it.gstRate}%</span>:<span style={{fontSize:11,background:"#f5f5f5",color:"#999",padding:"2px 7px",borderRadius:4}}>Exempt</span>}
                  </td>
                  <td style={{padding:"10px 12px",textAlign:"right",fontSize:13,fontWeight:500}}>₹{fmt(b+g)}</td>
                </tr>
              );})}
            </tbody>
          </table>
          <div style={{display:"flex",justifyContent:"flex-end"}}>
            <div style={{width:264}}>
              {[{l:"Subtotal",v:`₹${fmt(invoice.subtotal)}`},{l:"GST",v:`₹${fmt(invoice.gstTotal)}`,c:"#43c59e"},
                ...(invoice.discount>0?[{l:`Discount${invoice.discountType==="percent"?` (${invoice.discount}%)`:" (flat)"}`,v:`-₹${fmt(invoice.discountType==="percent"?(invoice.subtotal+invoice.gstTotal)*invoice.discount/100:invoice.discount)}`,c:"#e05252"}]:[])
              ].map(r=>(
                <div key={r.l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",fontSize:13,borderBottom:"1px solid #f5f5f5"}}>
                  <span style={{color:r.c||"#888"}}>{r.l}</span><span style={{color:r.c||"#555"}}>{r.v}</span>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",padding:"14px 16px",background:"#f5f3ff",borderRadius:10,marginTop:10}}>
                <span style={{fontSize:15,fontWeight:600,color:"#7c6af7"}}>Total</span>
                <span style={{fontSize:20,fontWeight:700,color:"#7c6af7"}}>₹{fmt(invoice.total)}</span>
              </div>
            </div>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginTop:32,paddingTop:16,borderTop:"1px solid #f0f0f0"}}>
            <div><div style={{fontSize:13,color:"#888"}}>Thank you for your business! 🙏</div>{shop.gstin&&<div style={{fontSize:11,color:"#aaa",marginTop:3}}>GSTIN: {shop.gstin}</div>}</div>
            <div style={{textAlign:"center"}}><div style={{width:130,borderTop:"1px solid #ccc",paddingTop:6,fontSize:11,color:"#aaa"}}>Authorised Signature</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCTS PANEL
// ─────────────────────────────────────────────────────────────────────────────
function ProductsPanel({products,ledger,onAdd,onUpdate,onDelete}) {
  const [showForm,setShowForm]=useState(false);
  const [editing, setEditing] =useState(null);
  const [search,  setSearch]  =useState("");
  const filtered=products.filter(p=>p.name.toLowerCase().includes(search.toLowerCase())||(p.hsn||"").includes(search));

  const Toggle=({val,onChange,t="Yes",f="No"})=>(
    <div style={{display:"flex",gap:8,marginTop:6}}>
      {[[true,t],[false,f]].map(([v,l])=>(
        <button key={String(v)} onClick={()=>onChange(v)} style={{flex:1,padding:"9px 0",borderRadius:8,border:`1px solid ${val===v?"#7c6af7":"#2a2d3a"}`,background:val===v?"#7c6af720":"transparent",color:val===v?"#7c6af7":"#7a7d8f",cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>{l}</button>
      ))}
    </div>
  );

  function ProdForm({product,onSave,onCancel}) {
    const [f,setF]=useState(product||{name:"",hsn:"",unit:"pcs",rate:"",gstApplicable:true,gstRate:18,trackInventory:true,lowStockThreshold:5});
    const s=(k,v)=>setF(p=>({...p,[k]:v}));
    const save=()=>{if(!f.name.trim()||!f.rate)return;onSave({...f,rate:parseFloat(f.rate),gstRate:f.gstApplicable?parseFloat(f.gstRate):0,lowStockThreshold:parseFloat(f.lowStockThreshold)||5});};
    return(
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div style={{gridColumn:"1/-1"}}><label style={lbl}>Product Name *</label><input style={inp} value={f.name} onChange={e=>s("name",e.target.value)}/></div>
          <div><label style={lbl}>HSN Code</label><input style={inp} value={f.hsn} onChange={e=>s("hsn",e.target.value)}/></div>
          <div><label style={lbl}>Unit</label><select style={inp} value={f.unit} onChange={e=>s("unit",e.target.value)}>{["pcs","kg","g","litre","ml","box","pack","dozen","set","mtr","sqft"].map(u=><option key={u}>{u}</option>)}</select></div>
          <div><label style={lbl}>Rate (₹) *</label><input style={inp} type="number" value={f.rate} onChange={e=>s("rate",e.target.value)}/></div>
          <div><label style={lbl}>GST Applicable</label><Toggle val={f.gstApplicable} onChange={v=>s("gstApplicable",v)}/></div>
          {f.gstApplicable&&<div><label style={lbl}>GST Rate (%)</label><select style={inp} value={f.gstRate} onChange={e=>s("gstRate",parseFloat(e.target.value))}>{[0,.1,.25,1,1.5,3,5,7.5,12,18,28].map(r=><option key={r} value={r}>{r}%</option>)}</select></div>}
          <div><label style={lbl}>Track Inventory</label><Toggle val={f.trackInventory} onChange={v=>s("trackInventory",v)}/></div>
          {f.trackInventory&&<div><label style={lbl}>Low Stock Alert (qty)</label><input style={inp} type="number" value={f.lowStockThreshold} onChange={e=>s("lowStockThreshold",e.target.value)}/></div>}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onCancel} style={{...btn("transparent","#7a7d8f",{flex:1,border:"1px solid #2a2d3a"})}}>Cancel</button>
          <button onClick={save}     style={{...btn("#7c6af7","#fff",{flex:2})}}>{product?"Update":"Add Product"}</button>
        </div>
      </div>
    );
  }

  return(
    <div className="fade-in">
      <div style={{display:"flex",gap:12,marginBottom:20}}>
        <input style={{...inp,flex:1}} placeholder="Search products…" value={search} onChange={e=>setSearch(e.target.value)}/>
        <button onClick={()=>{setShowForm(true);setEditing(null);}} style={btn("#7c6af7","#fff",{whiteSpace:"nowrap"})}>+ Add Product</button>
      </div>
      {showForm&&(
        <div style={{...card(),marginBottom:16,borderColor:"#7c6af730"}}>
          <h3 style={{color:"#e8e9f0",fontSize:14,marginBottom:16}}>{editing?"Edit":"New"} Product</h3>
          <ProdForm product={editing} onSave={p=>{editing?onUpdate(editing._id||editing.id,p):onAdd(p);setShowForm(false);setEditing(null);}} onCancel={()=>{setShowForm(false);setEditing(null);}}/>
        </div>
      )}
      {filtered.length===0
        ?<div style={{textAlign:"center",padding:"48px 0",color:"#7a7d8f"}}><div style={{fontSize:36,marginBottom:10}}>📦</div><p>{search?"No match.":"Add your first product!"}</p></div>
        :<div style={{display:"flex",flexDirection:"column",gap:8}}>
          {filtered.map(p=>{
            const st=stockStatus(getStock(p._id||p.id,ledger),p.lowStockThreshold);
            return(
              <div key={p._id||p.id} style={{...card(),display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px"}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                    <span style={{color:"#e8e9f0",fontWeight:500,fontSize:14}}>{p.name}</span>
                    {p.hsn&&<span style={{fontSize:11,color:"#7c6af7",background:"#7c6af720",padding:"2px 8px",borderRadius:4}}>HSN {p.hsn}</span>}
                    {p.trackInventory&&<span style={{fontSize:11,color:st.c,background:st.bg,padding:"2px 8px",borderRadius:4}}>{st.label}</span>}
                  </div>
                  <div style={{display:"flex",gap:16,marginTop:5,flexWrap:"wrap"}}>
                    <span style={{color:"#7a7d8f",fontSize:12}}>₹{fmt(p.rate)} / {p.unit}</span>
                    <span style={{color:p.gstApplicable?"#43c59e":"#7a7d8f",fontSize:12}}>GST: {p.gstApplicable?`${p.gstRate}%`:"Exempt"}</span>
                    {p.trackInventory&&<span style={{color:"#b0b3c2",fontSize:12}}>Stock: {fmtQ(getStock(p._id||p.id,ledger))} {p.unit}</span>}
                  </div>
                </div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>{setEditing(p);setShowForm(true);}} style={{...btn("transparent","#7a7d8f",{padding:"6px 12px",fontSize:12,border:"1px solid #2a2d3a"})}}>Edit</button>
                  <button onClick={()=>onDelete(p._id||p.id)}             style={{...btn("transparent","#e05252",{padding:"6px 12px",fontSize:12,border:"1px solid #e0525222"})}}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INVENTORY PANEL
// ─────────────────────────────────────────────────────────────────────────────
function InventoryPanel({products,ledger,onAdjust}) {
  const [selPid,setSelPid]=useState("");
  const [type,  setType]  =useState("in");
  const [qty,   setQty]   =useState("");
  const [note,  setNote]  =useState("");
  const [filter,setFilter]=useState("all");
  const [saved, setSaved] =useState(false);

  const tracked=products.filter(p=>p.trackInventory);
  const alerts =tracked.filter(p=>getStock(p._id||p.id,ledger)<=(p.lowStockThreshold||5));
  const prodMap=Object.fromEntries(products.map(p=>[p._id||p.id,p]));
  const shown=[...ledger].filter(e=>filter==="all"||(e.productId===filter||e.productId?._id===filter));
  const selP=selPid?products.find(p=>(p._id||p.id)===selPid):null;
  const curS=selP?getStock(selPid,ledger):0;

  const saveAdj=async()=>{
    if(!selPid||!qty||parseFloat(qty)<=0)return;
    await onAdjust({productId:selPid,type,qty:parseFloat(qty),note,source:"manual"});
    setQty("");setNote("");setSaved(true);setTimeout(()=>setSaved(false),1600);
  };

  return(
    <div style={{display:"grid",gridTemplateColumns:"1fr 360px",gap:16,alignItems:"start"}} className="fade-in">
      <div>
        {alerts.length>0&&(
          <div style={{background:"#f0a50010",border:"1px solid #f0a50030",borderRadius:12,padding:"14px 16px",marginBottom:16}}>
            <div style={{color:"#f0a500",fontSize:13,fontWeight:500,marginBottom:10}}>⚠ Low Stock — {alerts.length} product{alerts.length>1?"s":""}</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>{alerts.map(p=><span key={p._id||p.id} style={{fontSize:12,background:"#0f1117",border:"1px solid #f0a50030",borderRadius:6,padding:"4px 10px",color:"#f0a500"}}>{p.name} — {fmtQ(getStock(p._id||p.id,ledger))} {p.unit}</span>)}</div>
          </div>
        )}
        <div style={{...card(),marginBottom:16}}>
          <h3 style={{color:"#e8e9f0",fontSize:14,fontWeight:500,marginBottom:16}}>Stock Summary</h3>
          {tracked.length===0?<p style={{color:"#7a7d8f",fontSize:13}}>Enable inventory tracking per product.</p>:
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr style={{borderBottom:"1px solid #2a2d3a"}}>{["Product","Stock","Alert At","Status"].map(h=><th key={h} style={{padding:"8px",textAlign:"left",color:"#7a7d8f",fontSize:11,fontWeight:500}}>{h}</th>)}</tr></thead>
              <tbody>{tracked.map(p=>{const s=getStock(p._id||p.id,ledger);const st=stockStatus(s,p.lowStockThreshold);return(
                <tr key={p._id||p.id} style={{borderBottom:"1px solid #2a2d3a20"}}>
                  <td style={{padding:"10px 8px",color:"#e8e9f0",fontSize:13}}>{p.name}</td>
                  <td style={{padding:"10px 8px",color:"#b0b3c2",fontSize:13,fontWeight:500}}>{fmtQ(s)} {p.unit}</td>
                  <td style={{padding:"10px 8px",color:"#7a7d8f",fontSize:13}}>{p.lowStockThreshold} {p.unit}</td>
                  <td style={{padding:"10px 8px"}}><span style={{fontSize:11,color:st.c,background:st.bg,padding:"3px 10px",borderRadius:20}}>{st.label}</span></td>
                </tr>);})}</tbody>
            </table>}
        </div>
        <div style={card()}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
            <h3 style={{color:"#e8e9f0",fontSize:14,fontWeight:500}}>Stock Ledger</h3>
            <select style={{...inp,width:"auto",padding:"6px 32px 6px 10px",fontSize:12}} value={filter} onChange={e=>setFilter(e.target.value)}>
              <option value="all">All products</option>
              {products.map(p=><option key={p._id||p.id} value={p._id||p.id}>{p.name}</option>)}
            </select>
          </div>
          {shown.length===0?<p style={{color:"#7a7d8f",fontSize:13,textAlign:"center",padding:"20px 0"}}>No entries yet.</p>:
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {shown.slice(0,80).map(e=>{const p=prodMap[e.productId]||prodMap[e.productId?._id];return(
                <div key={e._id||e.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 12px",background:"#0f1117",borderRadius:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:30,height:30,borderRadius:6,background:e.type==="in"?"#43c59e20":"#e0525220",display:"flex",alignItems:"center",justifyContent:"center",color:e.type==="in"?"#43c59e":"#e05252",fontSize:16,fontWeight:700}}>{e.type==="in"?"↓":"↑"}</div>
                    <div>
                      <div style={{color:"#e8e9f0",fontSize:13}}>{p?p.name:"Deleted product"}</div>
                      <div style={{color:"#7a7d8f",fontSize:11}}>{e.note||(e.source==="invoice"?`Invoice: ${e.invoiceId}`:"Manual")} · {new Date(e.createdAt||e.date).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}</div>
                    </div>
                  </div>
                  <span style={{color:e.type==="in"?"#43c59e":"#e05252",fontSize:13,fontWeight:500}}>{e.type==="in"?"+":"−"}{fmtQ(e.qty)} {p?p.unit:""}</span>
                </div>
              );})}
            </div>}
        </div>
      </div>
      <div style={{position:"sticky",top:72}}>
        <div style={card()}>
          <h3 style={{color:"#e8e9f0",fontSize:14,fontWeight:500,marginBottom:20}}>Adjust Stock</h3>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div><label style={lbl}>Product</label><select style={inp} value={selPid} onChange={e=>setSelPid(e.target.value)}><option value="">Select…</option>{tracked.map(p=><option key={p._id||p.id} value={p._id||p.id}>{p.name}</option>)}</select></div>
            <div><label style={lbl}>Type</label>
              <div style={{display:"flex",gap:8}}>
                {[["in","Stock In","#43c59e"],["out","Stock Out","#e05252"]].map(([v,l,c])=>(
                  <button key={v} onClick={()=>setType(v)} style={{flex:1,padding:"9px 0",borderRadius:8,border:`1px solid ${type===v?c:"#2a2d3a"}`,background:type===v?`${c}20`:"transparent",color:type===v?c:"#7a7d8f",cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>{l}</button>
                ))}
              </div>
            </div>
            <div><label style={lbl}>Quantity</label><input style={inp} type="number" value={qty} onChange={e=>setQty(e.target.value)} min=".01" step=".01"/></div>
            <div><label style={lbl}>Note (optional)</label><input style={inp} value={note} onChange={e=>setNote(e.target.value)} placeholder="e.g. Received from supplier"/></div>
            {selP&&<div style={{background:"#0f1117",borderRadius:8,padding:"10px 12px",fontSize:12}}><span style={{color:"#7a7d8f"}}>Current: </span><span style={{color:"#e8e9f0",fontWeight:500}}>{fmtQ(curS)} {selP.unit}</span>{qty&&parseFloat(qty)>0&&<><span style={{color:"#7a7d8f"}}> → </span><span style={{color:type==="in"?"#43c59e":"#e05252",fontWeight:500}}>{fmtQ(type==="in"?curS+parseFloat(qty):curS-parseFloat(qty))} {selP.unit}</span></>}</div>}
            <button onClick={saveAdj} disabled={!selPid||!qty||parseFloat(qty)<=0}
              style={{...btn(saved?"#43c59e":!selPid||!qty?"#2a2d3a":type==="in"?"#43c59e30":"#e0525230",saved?"#fff":!selPid||!qty?"#7a7d8f":type==="in"?"#43c59e":"#e05252",{border:`1px solid ${!selPid||!qty?"#2a2d3a":type==="in"?"#43c59e50":"#e0525250"}`,width:"100%",cursor:!selPid||!qty?"not-allowed":"pointer",transition:"all .3s"})}}>
              {saved?"✓ Updated!":`Save ${type==="in"?"Stock In":"Stock Out"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BILLING PANEL
// ─────────────────────────────────────────────────────────────────────────────
function BillingPanel({products,ledger,onSaveInvoice}) {
  const [customer,setCustomer]=useState({name:"",phone:"",address:""});
  const [items,   setItems]   =useState([]);
  const [search,  setSearch]  =useState("");
  const [dropdown,setDropdown]=useState([]);
  const [invNo,   setInvNo]   =useState(uid);
  const [date,    setDate]    =useState(new Date().toISOString().slice(0,10));
  const [discount,setDiscount]=useState("");
  const [discType,setDiscType]=useState("flat");
  const [warns,   setWarns]   =useState([]);
  const [saving,  setSaving]  =useState(false);
  const [saved,   setSaved]   =useState(false);
  const sRef=useRef();

  const searchP=q=>{if(!q.trim()){setDropdown([]);return;}setDropdown(products.filter(p=>p.name.toLowerCase().includes(q.toLowerCase())));};
  const addItem=prod=>{
    setItems(prev=>{const ex=prev.find(i=>i.productId===(prod._id||prod.id));if(ex)return prev.map(i=>i.productId===(prod._id||prod.id)?{...i,qty:i.qty+1}:i);return [...prev,{productId:prod._id||prod.id,name:prod.name,unit:prod.unit,rate:prod.rate,gstApplicable:prod.gstApplicable,gstRate:prod.gstRate,qty:1,trackInventory:prod.trackInventory}];});
    setSearch("");setDropdown([]);
  };
  const updItem=(idx,k,v)=>setItems(prev=>prev.map((it,i)=>i===idx?{...it,[k]:v}:it));
  const rmItem=idx=>setItems(prev=>prev.filter((_,i)=>i!==idx));

  const pre=items.reduce((a,it)=>{const b=it.qty*it.rate;const g=it.gstApplicable?b*it.gstRate/100:0;return{subtotal:a.subtotal+b,gstTotal:a.gstTotal+g};},{subtotal:0,gstTotal:0});
  const beforeDisc=pre.subtotal+pre.gstTotal;
  const discAmt=!discount||parseFloat(discount)<=0?0:discType==="percent"?beforeDisc*parseFloat(discount)/100:parseFloat(discount);
  const totalAmt=Math.max(0,beforeDisc-discAmt);

  const save=async()=>{
    if(!customer.name||items.length===0)return;
    const ws=[];
    items.forEach(it=>{if(!it.trackInventory)return;const s=getStock(it.productId,ledger);if(it.qty>s)ws.push(`${it.name}: need ${it.qty}, have ${fmtQ(s)}`);});
    if(ws.length>0){setWarns(ws);return;}
    setWarns([]);setSaving(true);
    const invoice={invoiceNo:invNo,date,customer,items,subtotal:pre.subtotal,gstTotal:pre.gstTotal,discount:parseFloat(discount)||0,discountType:discType,total:totalAmt};
    const ded=items.filter(i=>i.trackInventory).map(i=>({productId:i.productId,type:"out",qty:i.qty,note:`Invoice ${invNo}`}));
    await onSaveInvoice(invoice,ded);
    setSaving(false);setSaved(true);
    setTimeout(()=>{setSaved(false);setItems([]);setCustomer({name:"",phone:"",address:""});setDiscount("");setInvNo(uid());setDate(new Date().toISOString().slice(0,10));},1600);
  };

  const TRow=({l,v,bold,c})=><div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"#7a7d8f",fontSize:13}}>{l}</span><span style={{color:c||(bold?"#e8e9f0":"#b0b3c2"),fontSize:bold?16:13,fontWeight:bold?600:400}}>{v}</span></div>;

  return(
    <div style={{display:"grid",gridTemplateColumns:"1fr 320px",gap:16}} className="fade-in">
      <div>
        <div style={{...card(),marginBottom:16}}>
          <h3 style={{color:"#e8e9f0",fontSize:14,fontWeight:500,marginBottom:14}}>Invoice Details</h3>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div><label style={lbl}>Invoice No.</label><input style={inp} value={invNo} onChange={e=>setInvNo(e.target.value)}/></div>
            <div><label style={lbl}>Date</label><input style={inp} type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
            <div><label style={lbl}>Customer Name *</label><input style={inp} value={customer.name} onChange={e=>setCustomer(c=>({...c,name:e.target.value}))} placeholder="Customer name"/></div>
            <div><label style={lbl}>Phone</label><input style={inp} value={customer.phone} onChange={e=>setCustomer(c=>({...c,phone:e.target.value}))} placeholder="+91 XXXXX XXXXX"/></div>
            <div style={{gridColumn:"1/-1"}}><label style={lbl}>Address</label><input style={inp} value={customer.address} onChange={e=>setCustomer(c=>({...c,address:e.target.value}))} placeholder="Customer address"/></div>
          </div>
        </div>
        <div style={card()}>
          <h3 style={{color:"#e8e9f0",fontSize:14,fontWeight:500,marginBottom:14}}>Add Items</h3>
          <div style={{position:"relative",marginBottom:16}}>
            <input ref={sRef} style={inp} placeholder="Search product name…" value={search} onChange={e=>{setSearch(e.target.value);searchP(e.target.value);}}/>
            {dropdown.length>0&&(
              <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:"#181a23",border:"1px solid #2a2d3a",borderRadius:8,zIndex:99,overflow:"hidden",boxShadow:"0 12px 40px #00000080",maxHeight:260,overflowY:"auto"}}>
                {dropdown.map(p=>{const s=p.trackInventory?getStock(p._id||p.id,ledger):null;const st=s!==null?stockStatus(s,p.lowStockThreshold):null;return(
                  <div key={p._id||p.id} onClick={()=>addItem(p)} style={{padding:"10px 14px",cursor:"pointer",borderBottom:"1px solid #2a2d3a20"}}
                    onMouseEnter={e=>e.currentTarget.style.background="#2a2d3a"}
                    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{color:"#e8e9f0",fontSize:14}}>{p.name}</span>
                      <div style={{display:"flex",gap:8,alignItems:"center"}}>
                        {st&&<span style={{fontSize:11,color:st.c,background:st.bg,padding:"2px 8px",borderRadius:4}}>{fmtQ(s)} {p.unit}</span>}
                        <span style={{color:"#7a7d8f",fontSize:12}}>₹{fmt(p.rate)}</span>
                      </div>
                    </div>
                  </div>
                );})}
              </div>
            )}
          </div>
          {warns.length>0&&<div style={{background:"#e0525215",border:"1px solid #e0525230",borderRadius:8,padding:"10px 14px",marginBottom:12}}><p style={{color:"#e05252",fontSize:13,fontWeight:500,marginBottom:4}}>Insufficient stock:</p>{warns.map((w,i)=><p key={i} style={{color:"#e05252",fontSize:12}}>• {w}</p>)}</div>}
          {items.length>0?(
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead><tr style={{borderBottom:"1px solid #2a2d3a"}}>{["Product","Qty","Rate (₹)","GST","Amount",""].map(h=><th key={h} style={{padding:"6px 8px",textAlign:"left",color:"#7a7d8f",fontSize:11,fontWeight:500}}>{h}</th>)}</tr></thead>
              <tbody>{items.map((it,idx)=>{const b=it.qty*it.rate;const g=it.gstApplicable?b*it.gstRate/100:0;const s=it.trackInventory?getStock(it.productId,ledger):null;const over=s!==null&&it.qty>s;return(
                <tr key={idx} style={{borderBottom:"1px solid #2a2d3a20"}}>
                  <td style={{padding:"8px",color:"#e8e9f0",fontSize:13}}>{it.name}{over&&<div style={{color:"#e05252",fontSize:10}}>Only {fmtQ(s)} available</div>}</td>
                  <td style={{padding:"8px"}}><input type="number" style={{...inp,width:68,padding:"6px 8px",fontSize:13,borderColor:over?"#e05252":"#2a2d3a"}} value={it.qty} min=".1" step=".1" onChange={e=>updItem(idx,"qty",parseFloat(e.target.value)||0)}/></td>
                  <td style={{padding:"8px"}}><input type="number" style={{...inp,width:90,padding:"6px 8px",fontSize:13}} value={it.rate} onChange={e=>updItem(idx,"rate",parseFloat(e.target.value)||0)}/></td>
                  <td style={{padding:"8px",color:it.gstApplicable?"#43c59e":"#7a7d8f",fontSize:13}}>{it.gstApplicable?`${it.gstRate}%`:"—"}</td>
                  <td style={{padding:"8px",color:"#e8e9f0",fontSize:13,fontWeight:500}}>₹{fmt(b+g)}</td>
                  <td style={{padding:"8px"}}><button onClick={()=>rmItem(idx)} style={{background:"transparent",border:"none",color:"#e05252",cursor:"pointer",fontSize:20,lineHeight:1,padding:0}}>×</button></td>
                </tr>
              );})}
              </tbody>
            </table>
          ):<div style={{textAlign:"center",padding:"28px 0",color:"#7a7d8f",fontSize:13}}>Search and add products above</div>}
        </div>
      </div>
      <div>
        <div style={{...card(),position:"sticky",top:72}}>
          <h3 style={{color:"#e8e9f0",fontSize:14,fontWeight:500,marginBottom:18}}>Summary</h3>
          <div style={{display:"flex",flexDirection:"column",gap:9}}>
            <TRow l="Subtotal" v={`₹${fmt(pre.subtotal)}`}/>
            <TRow l="GST" v={`₹${fmt(pre.gstTotal)}`} c="#43c59e"/>
            <TRow l="Before discount" v={`₹${fmt(beforeDisc)}`}/>
          </div>
          <div style={{background:"#0f1117",borderRadius:8,padding:12,margin:"14px 0"}}>
            <label style={{...lbl,marginBottom:8}}>Discount</label>
            <div style={{display:"flex",gap:6,marginBottom:8}}>
              {[["flat","₹ Flat"],["percent","% Percent"]].map(([v,l])=>(
                <button key={v} onClick={()=>setDiscType(v)} style={{flex:1,padding:"7px 0",borderRadius:7,border:`1px solid ${discType===v?"#7c6af7":"#2a2d3a"}`,background:discType===v?"#7c6af720":"transparent",color:discType===v?"#7c6af7":"#7a7d8f",cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>{l}</button>
              ))}
            </div>
            <input style={{...inp,fontSize:13}} type="number" value={discount} onChange={e=>setDiscount(e.target.value)} placeholder={discType==="flat"?"Amount (₹)":"Percentage (%)"}/>
            {discAmt>0&&<p style={{color:"#e05252",fontSize:11,marginTop:6}}>Discount: -₹{fmt(discAmt)}</p>}
          </div>
          <div style={{borderTop:"1px solid #2a2d3a",paddingTop:12,marginBottom:4}}><TRow l="Total" v={`₹${fmt(totalAmt)}`} bold/></div>
          <div style={{background:"#0f1117",borderRadius:8,padding:"10px 12px",marginBottom:14}}><p style={{color:"#7a7d8f",fontSize:11,marginBottom:2}}>Items: {items.length} · {invNo}</p><p style={{color:"#7a7d8f",fontSize:11}}>📦 Stock auto-deducted on save</p></div>
          <button onClick={save} disabled={saving||!customer.name||items.length===0}
            style={{...btn(saved?"#43c59e":!customer.name||items.length===0?"#2a2d3a":"#7c6af7","#fff",{width:"100%",padding:12,cursor:!customer.name||items.length===0?"not-allowed":"pointer",transition:"all .3s",opacity:saving?.7:1})}}>
            {saving?"Saving…":saved?"✓ Saved!":"Save Invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INVOICES PANEL
// ─────────────────────────────────────────────────────────────────────────────
function InvoicesPanel({invoices,shop,onDelete}) {
  const [selected,setSelected]=useState(null);
  const [printing,setPrinting]=useState(null);
  const TRow=({l,v,bold,c})=><div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:"#7a7d8f",fontSize:13}}>{l}</span><span style={{color:c||(bold?"#e8e9f0":"#b0b3c2"),fontSize:bold?16:13,fontWeight:bold?600:400}}>{v}</span></div>;

  if(printing) return <PrintInvoice invoice={printing} shop={shop} onClose={()=>setPrinting(null)}/>;

  if(selected){const inv=selected;return(
    <div className="fade-in">
      <div style={{display:"flex",gap:10,marginBottom:20}}>
        <button onClick={()=>setSelected(null)}    style={{...btn("transparent","#7a7d8f",{border:"1px solid #2a2d3a",fontSize:13,padding:"8px 16px"})}}>← Back</button>
        <button onClick={()=>setPrinting(inv)}     style={{...btn("#7c6af7","#fff",{padding:"8px 16px",fontSize:13})}}>🖨 Print</button>
        <button onClick={async()=>{await onDelete(inv._id||inv.id);setSelected(null);}} style={{...btn("transparent","#e05252",{border:"1px solid #e0525222",padding:"8px 16px",fontSize:13})}}>Delete</button>
      </div>
      <div style={card()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
          <div><h2 style={{color:"#e8e9f0",fontSize:20,fontWeight:600}}>{inv.invoiceNo}</h2><p style={{color:"#7a7d8f",fontSize:13,marginTop:4}}>{inv.date}</p></div>
          <div style={{textAlign:"right"}}><p style={{color:"#e8e9f0",fontWeight:500}}>{inv.customer?.name}</p>{inv.customer?.phone&&<p style={{color:"#7a7d8f",fontSize:13}}>{inv.customer.phone}</p>}{inv.customer?.address&&<p style={{color:"#7a7d8f",fontSize:12}}>{inv.customer.address}</p>}</div>
        </div>
        <table style={{width:"100%",borderCollapse:"collapse",marginBottom:20}}>
          <thead><tr style={{borderBottom:"1px solid #2a2d3a"}}>{["Product","Qty","Rate","GST","Amount"].map(h=><th key={h} style={{padding:"8px",textAlign:h==="Product"?"left":"right",color:"#7a7d8f",fontSize:12}}>{h}</th>)}</tr></thead>
          <tbody>{inv.items.map((it,i)=>{const b=it.qty*it.rate;const g=it.gstApplicable?b*it.gstRate/100:0;return(
            <tr key={i} style={{borderBottom:"1px solid #2a2d3a20"}}>
              <td style={{padding:"10px 8px",color:"#e8e9f0",fontSize:13}}>{it.name}</td>
              <td style={{padding:"10px 8px",textAlign:"right",color:"#b0b3c2",fontSize:13}}>{fmtQ(it.qty)} {it.unit}</td>
              <td style={{padding:"10px 8px",textAlign:"right",color:"#b0b3c2",fontSize:13}}>₹{fmt(it.rate)}</td>
              <td style={{padding:"10px 8px",textAlign:"right",color:"#43c59e",fontSize:13}}>{it.gstApplicable?`${it.gstRate}%`:"—"}</td>
              <td style={{padding:"10px 8px",textAlign:"right",color:"#e8e9f0",fontSize:13,fontWeight:500}}>₹{fmt(b+g)}</td>
            </tr>);})}
          </tbody>
        </table>
        <div style={{display:"flex",justifyContent:"flex-end"}}>
          <div style={{width:264,display:"flex",flexDirection:"column",gap:8}}>
            <TRow l="Subtotal" v={`₹${fmt(inv.subtotal)}`}/>
            <TRow l="GST" v={`₹${fmt(inv.gstTotal)}`} c="#43c59e"/>
            {inv.discount>0&&<TRow l={`Discount${inv.discountType==="percent"?` (${inv.discount}%)`:" (flat)"}`} v={`-₹${fmt(inv.discountType==="percent"?(inv.subtotal+inv.gstTotal)*inv.discount/100:inv.discount)}`} c="#e05252"/>}
            <div style={{borderTop:"1px solid #2a2d3a",paddingTop:8}}><TRow l="Total" v={`₹${fmt(inv.total)}`} bold/></div>
          </div>
        </div>
      </div>
    </div>
  );}

  return(
    <div className="fade-in">
      {invoices.length===0
        ?<div style={{textAlign:"center",padding:"60px 0",color:"#7a7d8f"}}><div style={{fontSize:40,marginBottom:12}}>🧾</div><p>No invoices yet.</p></div>
        :<div style={{display:"flex",flexDirection:"column",gap:8}}>
          {invoices.map(inv=>(
            <div key={inv._id||inv.id} style={{...card(),display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px",cursor:"pointer",transition:"border-color .2s"}}
              onMouseEnter={e=>e.currentTarget.style.borderColor="#7c6af750"}
              onMouseLeave={e=>e.currentTarget.style.borderColor="#2a2d3a"}>
              <div onClick={()=>setSelected(inv)} style={{flex:1}}>
                <div style={{color:"#e8e9f0",fontWeight:500,fontSize:14}}>{inv.invoiceNo}</div>
                <div style={{color:"#7a7d8f",fontSize:12,marginTop:2}}>{inv.customer?.name} · {inv.date}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{textAlign:"right"}} onClick={()=>setSelected(inv)}><div style={{color:"#e8e9f0",fontWeight:600,fontSize:15}}>₹{fmt(inv.total)}</div><div style={{color:"#7a7d8f",fontSize:12}}>{inv.items.length} items</div></div>
                <button onClick={e=>{e.stopPropagation();setPrinting(inv);}} style={{...btn("#7c6af720","#7c6af7",{padding:"6px 12px",fontSize:12,border:"1px solid #7c6af730"})}}>🖨</button>
              </div>
            </div>
          ))}
        </div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SHOP SETTINGS
// ─────────────────────────────────────────────────────────────────────────────
function ShopSettings({user,onUpdate}) {
  const [shop,  setShop]  =useState(user.shop||{});
  const [saved, setSaved] =useState(false);
  const [busy,  setBusy]  =useState(false);
  const [err,   setErr]   =useState("");
  const logoRef=useRef();
  const setS=(k,v)=>setShop(s=>({...s,[k]:v}));
  const handleLogo=e=>{const file=e.target.files[0];if(!file)return;const r=new FileReader();r.onload=ev=>setS("logo",ev.target.result);r.readAsDataURL(file);};
  const save=async()=>{setBusy(true);setErr("");try{const d=await api.put("/api/shop",shop);onUpdate(d.shop);setSaved(true);setTimeout(()=>setSaved(false),1600);}catch(e){setErr(e.message);}finally{setBusy(false);}};
  const logoSrc=shop.logo&&!shop.logo.startsWith("http")&&!shop.logo.startsWith("data:")?`${BASE_URL}${shop.logo}`:shop.logo;

  return(
    <div style={{maxWidth:560}} className="fade-in">
      <div style={card()}>
        <h3 style={{color:"#e8e9f0",fontSize:15,fontWeight:500,marginBottom:20}}>Shop Profile</h3>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,marginBottom:22}}>
          <div onClick={()=>logoRef.current.click()} style={{width:88,height:88,borderRadius:14,border:"2px dashed #2a2d3a",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",overflow:"hidden",background:"#0f1117",transition:"border .2s"}}
            onMouseEnter={e=>e.currentTarget.style.borderColor="#7c6af7"}
            onMouseLeave={e=>e.currentTarget.style.borderColor="#2a2d3a"}>
            {logoSrc?<img src={logoSrc} style={{width:"100%",height:"100%",objectFit:"cover"}} alt="logo" onError={e=>{e.target.style.display="none"}}/>:<span style={{fontSize:32,color:"#7a7d8f"}}>+</span>}
          </div>
          <p style={{color:"#7a7d8f",fontSize:12}}>Click to change shop logo</p>
          <input ref={logoRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleLogo}/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <div style={{gridColumn:"1/-1"}}><label style={lbl}>Shop Name *</label><input style={inp} value={shop.name||""} onChange={e=>setS("name",e.target.value)}/></div>
          <div style={{gridColumn:"1/-1"}}><label style={lbl}>Tagline</label><input style={inp} value={shop.tagline||""} onChange={e=>setS("tagline",e.target.value)}/></div>
          <div><label style={lbl}>Phone</label><input style={inp} value={shop.phone||""} onChange={e=>setS("phone",e.target.value)}/></div>
          <div><label style={lbl}>Email</label><input style={inp} value={shop.email||""} onChange={e=>setS("email",e.target.value)}/></div>
          <div style={{gridColumn:"1/-1"}}><label style={lbl}>Address</label><textarea style={{...inp,resize:"vertical",minHeight:60}} value={shop.address||""} onChange={e=>setS("address",e.target.value)}/></div>
          <div style={{gridColumn:"1/-1"}}><label style={lbl}>GSTIN</label><input style={inp} value={shop.gstin||""} onChange={e=>setS("gstin",e.target.value)} placeholder="22AAAAA0000A1Z5"/></div>
        </div>
        {err&&<p style={{color:"#e05252",fontSize:12,marginTop:12}}>{err}</p>}
        <button onClick={save} disabled={busy} style={{...btn(saved?"#43c59e":"#7c6af7","#fff",{marginTop:20,padding:"11px 24px",opacity:busy?.6:1})}}>
          {saved?"✓ Saved!":busy?"Saving…":"Save Shop Profile"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────────────────────────────────────
export default function BillDesk() {
  const [user,    setUser]    =useState(null);
  const [tab,     setTab]     =useState("billing");
  const [products,setProducts]=useState([]);
  const [ledger,  setLedger]  =useState([]);
  const [invoices,setInvoices]=useState([]);
  const [loading, setLoading] =useState(true);
  const [initDone,setInitDone]=useState(false);

  // Check URL for ?resetToken= on mount
  const urlParams      = new URLSearchParams(window.location.search);
  const resetTokenParam = urlParams.get("resetToken");

  useEffect(()=>{
    const token=localStorage.getItem("bd_token");
    if(!token){setLoading(false);setInitDone(true);return;}
    api.get("/api/health").then(()=>
      Promise.all([api.get("/api/products"),api.get("/api/ledger"),api.get("/api/invoices")]).then(([p,l,i])=>{
        setProducts(p);setLedger(l);setInvoices(i);
        const payload=JSON.parse(atob(token.split(".")[1]));
        setUser({id:payload.id,username:"(session)",shop:{}});
      })
    ).catch(()=>localStorage.removeItem("bd_token"))
    .finally(()=>{setLoading(false);setInitDone(true);});
  },[]);

  const handleLogin=async userData=>{
    setUser(userData);setLoading(true);
    // Clear reset token from URL
    window.history.replaceState({},"",window.location.pathname);
    try{const[p,l,i]=await Promise.all([api.get("/api/products"),api.get("/api/ledger"),api.get("/api/invoices")]);setProducts(p);setLedger(l);setInvoices(i);}catch{}
    setLoading(false);
  };

  const logout=()=>{localStorage.removeItem("bd_token");setUser(null);setProducts([]);setLedger([]);setInvoices([]);setTab("billing");};

  const addProduct   =useCallback(async p=>{const r=await api.post("/api/products",p);setProducts(prev=>[r,...prev]);},[]);
  const updateProduct=useCallback(async(id,p)=>{const r=await api.put(`/api/products/${id}`,p);setProducts(prev=>prev.map(x=>(x._id||x.id)===id?r:x));},[]);
  const deleteProduct=useCallback(async id=>{await api.del(`/api/products/${id}`);setProducts(prev=>prev.filter(x=>(x._id||x.id)!==id));setLedger(prev=>prev.filter(e=>e.productId!==id));},[]);
  const addStock     =useCallback(async e=>{const r=await api.post("/api/ledger",e);setLedger(prev=>[r,...prev]);},[]);
  const saveInvoice  =useCallback(async(invoice,ded)=>{const r=await api.post("/api/invoices",{invoice,stockDeductions:ded});setInvoices(prev=>[r,...prev]);const l=await api.get("/api/ledger");setLedger(l);},[]);
  const deleteInvoice=useCallback(async id=>{await api.del(`/api/invoices/${id}`);setInvoices(prev=>prev.filter(x=>(x._id||x.id)!==id));},[]);
  const updateShop   =shopData=>setUser(u=>({...u,shop:shopData}));

  if(!initDone) return <Spinner msg="Starting BillDesk…"/>;
  if(!user)     return <AuthScreen onLogin={handleLogin} initialResetToken={resetTokenParam||undefined}/>;

  const lowCount=products.filter(p=>p.trackInventory&&getStock(p._id||p.id,ledger)<=(p.lowStockThreshold||5)).length;
  const TABS=[
    {id:"billing",   label:"New Invoice"},
    {id:"inventory", label:"Inventory",badge:lowCount},
    {id:"products",  label:"Products"},
    {id:"invoices",  label:"Invoices"},
    {id:"settings",  label:"Shop"},
  ];

  return(
    <div style={{minHeight:"100vh",background:"#0f1117",fontFamily:"'DM Sans',sans-serif",color:"#e8e9f0"}}>
      <style>{G_CSS}</style>
      {/* Nav */}
      <div style={{borderBottom:"1px solid #2a2d3a",background:"#181a23",position:"sticky",top:0,zIndex:50}}>
        <div style={{maxWidth:1160,margin:"0 auto",padding:"0 24px",display:"flex",alignItems:"center",justifyContent:"space-between",height:56,gap:12,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            {user.shop?.logo&&<img src={user.shop.logo.startsWith("data:")||user.shop.logo.startsWith("http")?user.shop.logo:`${BASE_URL}${user.shop.logo}`} style={{width:28,height:28,borderRadius:6,objectFit:"cover"}} alt="" onError={e=>{e.target.style.display="none"}}/>}
            <span style={{fontWeight:600,fontSize:17,color:"#e8e9f0"}}>{user.shop?.name||"BillDesk"}</span>
          </div>
          <div style={{display:"flex",gap:2,background:"#0f1117",borderRadius:10,padding:4,border:"1px solid #2a2d3a"}}>
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{position:"relative",padding:"6px 13px",borderRadius:7,border:"none",background:tab===t.id?"#7c6af7":"transparent",color:tab===t.id?"#fff":"#7a7d8f",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:500,transition:"all .2s"}}>
                {t.label}
                {t.badge>0&&<span style={{position:"absolute",top:1,right:2,width:14,height:14,borderRadius:"50%",background:"#f0a500",color:"#0f1117",fontSize:9,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>{t.badge}</span>}
              </button>
            ))}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,background:"#0f1117",border:"1px solid #2a2d3a",borderRadius:8,padding:"5px 12px"}}>
            <div style={{width:24,height:24,borderRadius:"50%",background:"#7c6af730",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#7c6af7",fontWeight:600}}>{(user.username||"U")[0].toUpperCase()}</div>
            <span style={{color:"#b0b3c2",fontSize:13}}>{user.username}</span>
            <button onClick={logout} style={{background:"transparent",border:"none",color:"#7a7d8f",cursor:"pointer",fontSize:12,fontFamily:"inherit",marginLeft:4}}>Sign out</button>
          </div>
        </div>
      </div>
      {/* Content */}
      <div style={{maxWidth:1160,margin:"0 auto",padding:"28px 24px 56px"}}>
        {loading&&<Spinner full={false} msg="Loading your data…"/>}
        {!loading&&(
          <>
            {tab==="billing"   &&<BillingPanel   products={products} ledger={ledger} onSaveInvoice={saveInvoice}/>}
            {tab==="inventory" &&<InventoryPanel  products={products} ledger={ledger} onAdjust={addStock}/>}
            {tab==="products"  &&<ProductsPanel   products={products} ledger={ledger} onAdd={addProduct} onUpdate={updateProduct} onDelete={deleteProduct}/>}
            {tab==="invoices"  &&<InvoicesPanel   invoices={invoices} shop={user.shop||{}} onDelete={deleteInvoice}/>}
            {tab==="settings"  &&<ShopSettings    user={user} onUpdate={updateShop}/>}
          </>
        )}
      </div>
    </div>
  );
}
