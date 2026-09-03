import React, { useEffect, useState } from 'react';

const API = (path, token) => `http://localhost:4000/api${path}`;

function Login({ onLogin }){
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  async function submit(){
    const r = await fetch(API('/auth/login'), {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email, password})});
    const j = await r.json(); if(r.ok){ onLogin(j.token, j.user); } else { alert(j.error || 'Login failed'); }
  }
  return (
    <div style={{maxWidth:320}}>
      <h3>Login</h3>
      <input placeholder='email' value={email} onChange={e=>setEmail(e.target.value)} /><br/>
      <input placeholder='password' type='password' value={password} onChange={e=>setPassword(e.target.value)} /><br/>
      <button onClick={submit}>Login</button>
    </div>
  );
}

function Register(){
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  async function submit(){
    const r = await fetch(API('/auth/register'), {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name,email,password})});
    const j = await r.json(); if(r.ok){ alert('Registered — please login'); } else { alert(j.error || 'Register failed'); }
  }
  return (
    <div style={{maxWidth:320}}>
      <h3>Register</h3>
      <input placeholder='name' value={name} onChange={e=>setName(e.target.value)} /><br/>
      <input placeholder='email' value={email} onChange={e=>setEmail(e.target.value)} /><br/>
      <input placeholder='password' type='password' value={password} onChange={e=>setPassword(e.target.value)} /><br/>
      <button onClick={submit}>Register</button>
    </div>
  );
}

export default function App(){
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')||'null'));
  const [stages, setStages] = useState([]);
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({});

  useEffect(()=>{ if(token) loadData(); }, [token]);

  async function loadData(){
    const h = { Authorization: 'Bearer ' + token };
    const r1 = await fetch(API('/stages'), { headers: h }); setStages(await r1.json());
    const r2 = await fetch(API('/orders'), { headers: h }); setOrders(await r2.json());
    const r3 = await fetch(API('/stats'), { headers: h }); setStats(await r3.json());
  }

  function onLogin(t, u){ localStorage.setItem('token', t); localStorage.setItem('user', JSON.stringify(u)); setToken(t); setUser(u); }
  function logout(){ localStorage.removeItem('token'); localStorage.removeItem('user'); setToken(null); setUser(null); }

  async function createOrder(){
    const order_number = prompt('Order number?'); if(!order_number) return;
    const customer = prompt('Customer?');
    const due_date = prompt('Due date (YYYY-MM-DD)?');
    const priority = prompt('Priority (low/normal/high)?','normal');
    await fetch(API('/orders'), { method: 'POST', headers: { 'Content-Type':'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ order_number, customer, due_date, priority }) });
    loadData();
  }

  async function moveStage(order, stage){
    const op = prompt('Operator name? (leave blank to use your name)') || user.name || user.email;
    await fetch(API(`/orders/${order.id}/update`), { method: 'POST', headers: { 'Content-Type':'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ stage_name: stage.name, status: 'completed', operator: op }) });
    loadData();
  }

  if(!token) return (
    <div style={{padding:20}}>
      <h2>Herofashion — Process Tracker</h2>
      <div style={{display:'flex', gap:40}}>
        <Login onLogin={onLogin} />
        <Register />
      </div>
    </div>
  );

  return (
    <div style={{padding:20,fontFamily:'sans-serif'}}>
      <header style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h2>Herofashion — Dashboard</h2>
        <div>
          {user?.name} <button onClick={logout}>Logout</button>
        </div>
      </header>
      <div style={{marginTop:10,marginBottom:10}}>
        <button onClick={createOrder}>+ Create Order</button>
        <div style={{marginTop:8}}><strong>Stage counts:</strong>
          <div>{(stats.counts||[]).map(c => <div key={c.current_stage}>{c.current_stage}: {c.cnt}</div>)}</div>
        </div>
      </div>
      <div style={{display:'flex',gap:20}}>
        {stages.map(stage => (
          <div key={stage.name} style={{border:'1px solid #ccc',padding:10,minWidth:200}}>
            <h4>{stage.name}</h4>
            {orders.filter(o=>o.current_stage===stage.name).map(o=>(
              <div key={o.id} style={{border:'1px solid #eee',margin:6,padding:6}}>
                <div><strong>{o.order_number}</strong> ({o.priority})</div>
                <div>Due: {o.due_date || '-'} </div>
                <div>{o.customer}</div>
                <div style={{marginTop:6}}>
                  <button onClick={()=>moveStage(o, stage)}>Mark {stage.name} done</button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
