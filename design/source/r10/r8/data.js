/*
 * r8 proposal data: 612 invented people across 38 invented organisations,
 * shaped like /api/desk/master rows (+ day_validity and role_text, which the
 * redesign asks the API to return). Deterministic, so every proposal and every
 * screenshot shows the same list. No real person, phone or pass appears here.
 * The proposals are dated 6 Oct 2026 (build week, day 2; the gate went live 4 Oct).
 */
(function () {
  let s = 20261010
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296)
  const pick = (a) => a[Math.floor(rnd() * a.length)]

  const FIRST = ['Aarav','Aditi','Akash','Ananya','Anil','Arjun','Asha','Bhavana','Chaitra','Darshan','Deepa','Dhruv','Divya','Farhan','Gautam','Harini','Imran','Ishaan','Jyothi','Karthik','Kavya','Kiran','Lakshmi','Madhu','Manoj','Meera','Mohan','Nandini','Naveen','Neha','Nikhil','Pallavi','Pooja','Pradeep','Prakash','Priya','Rahul','Rakesh','Ramya','Ravi','Rohan','Sahana','Sameer','Sandeep','Sanjana','Shreya','Siddharth','Sneha','Srinivas','Suhas','Sunil','Swathi','Tanvi','Tejas','Uday','Varun','Vidya','Vikram','Vinay','Yash','Zoya','Ayesha','Joel','Maria','Tenzin','Noel','Rehana','Kabir','Irfan','Leela']
  const LAST = ['Rao','Shetty','Kumar','Reddy','Nair','Menon','Hegde','Gowda','Iyer','Bhat','Pai','Kamath','Naik','Sharma','Khan','D\'Souza','Fernandes','Joseph','Thomas','Das','Patil','Kulkarni','Murthy','Prasad','Raju','Varghese','Sheikh','Ahmed','Pinto','Srinivasan','Chandra','Banerjee','Mehta','Jain']
  const ORGS = [
    ['BOA Production Core', 'crew'], ['Chakra Sound & Light', 'vendor'], ['Sentinel Security Services', 'security'], ['Ironhoof Rigging', 'contractor'],
    ['Thunderjaw Merch', 'vendor'], ['Redline Beverages', 'sponsor'], ['Distortion Press', 'media'], ['Blackstone Staging', 'contractor'],
    ['Deccan Power & Gensets', 'contractor'], ['Kaveri Catering Co', 'vendor'], ['Nandi Hills Transport', 'vendor'], ['Loud Lens Collective', 'media'],
    ['Riff Raff Artist Care', 'crew'], ['Voltage Bar Services', 'vendor'], ['Iron Gate Barricades', 'contractor'], ['Medic One Response', 'vendor'],
    ['Pulse Ticketing Desk', 'crew'], ['Grim Grin Tattoo', 'vendor'], ['Obsidian Visuals', 'vendor'], ['Garden City Cleaners', 'contractor'],
    ['Headbang Radio', 'media'], ['Smokehouse Kitchen', 'vendor'], ['Monolith Screens', 'vendor'], ['Wildfire Pyro', 'contractor'],
    ['Cubbon Hospitality', 'crew'], ['Stagehand Union BLR', 'crew'], ['Amp Room Backline', 'vendor'], ['Fuzz Box Studios', 'media'],
    ['Silver Oak Water', 'sponsor'], ['Tusker Logistics', 'vendor'], ['Echo Chamber PR', 'media'], ['Nightshift Electricals', 'contractor'],
    ['Basecamp Tents', 'contractor'], ['Crossroads Merch', 'vendor'], ['High Voltage Energy', 'sponsor'], ['Forge Metalworks', 'contractor'],
    ['Artist Hospitality BLR', 'crew'], ['Promoters Circle', 'sponsor'],
  ]
  const ROLES = {
    crew: ['Runner','Stage manager','Production assistant','Accreditation desk','Site coordinator','Artist liaison','Hospitality lead'],
    vendor: ['Bartender','Cashier','Cook','FOH engineer','Monitor engineer','LED tech','Driver','Merch seller','Paramedic','Backline tech'],
    security: ['Guard','Supervisor','Gate lead','Bouncer'],
    contractor: ['Rigger','Electrician','Welder','Genset operator','Carpenter','Loader','Pyro tech'],
    sponsor: ['Brand manager','Promoter','Activation lead'],
    media: ['Photographer','Videographer','Journalist','Radio host'],
  }
  const TIER_FOR_KIND = { crew: ['crew','crew','stage','aaa','promoters'], vendor: ['crew','crew','crew','stage','eddies'], security: ['crew','crew','stage'], contractor: ['stage','crew','crew'], sponsor: ['promoters','promoters','eddies'], media: ['photo','photo','crew'] }
  const PLATES = () => `KA ${String(1 + Math.floor(rnd() * 60)).padStart(2, '0')} ${pick(['AB','MJ','CQ','HD','TR','EZ','KL','NP'])} ${String(1000 + Math.floor(rnd() * 8999))}`

  const orgs = ORGS.map(([name, kind], i) => ({ id: 'org-' + i, name, kind, contact: pick(FIRST) + ' ' + pick(LAST)[0] + '.', phone: '+91 9' + Math.floor(100000000 + rnd() * 899999999) }))
  const people = []
  let serial = 101
  for (let i = 0; i < 641; i++) {
    const org = orgs[i < 60 ? i % 6 : Math.floor(rnd() * orgs.length)]
    const tier = i === 3 ? 'aaa' : pick(TIER_FOR_KIND[org.kind])
    const status = i >= 612 ? 'submitted' : (rnd() < .005 ? 'voided' : rnd() < .004 ? 'rejected' : 'approved')
    const approved = status === 'approved'
    const collected = approved && rnd() < .30
    const hasVehicle = rnd() < .09
    const inBms = approved && rnd() < .977
    const sendRoll = rnd()
    const send = !approved ? 'none' : sendRoll < .07 ? 'none' : sendRoll < .10 ? 'failed' : sendRoll < .16 ? 'sent' : sendRoll < .55 ? 'delivered' : 'read'
    const day = pick(['build_show','build_show','show','show','build'])
    people.push({
      id: 'p-' + i,
      fullName: pick(FIRST) + ' ' + pick(LAST),
      phone: '+91 ' + (9 - Math.floor(rnd() * 3)) + String(Math.floor(100000000 + rnd() * 899999999)).replace(/(\d{4})(\d{5})/, '$1 $2'),
      orgId: org.id, orgName: org.name, orgKind: org.kind,
      role: pick(ROLES[org.kind]), tier, status, day,
      passRef: 'BOA26-' + String(1000 + i),
      vehicleReg: hasVehicle ? PLATES() : null,
      stickerNo: hasVehicle && collected && rnd() < .8 ? 'S-' + String(10 + i) : null,
      bandSerial: collected ? '#' + String(serial++).padStart(4, '0') : null,
      inBms,
      collectedAt: collected ? `0${4 + Math.floor(rnd() * 3)} Oct, ${String(7 + Math.floor(rnd() * 12)).padStart(2, '0')}:${String(Math.floor(rnd() * 60)).padStart(2, '0')}` : null,
      gate: collected ? pick(['Gate 1','Gate 1','Gate 2','Desk']) : null,
      send,
      lastSent: send === 'none' ? null : `${pick(['26','27','28'])} Sep, ${String(9 + Math.floor(rnd() * 10)).padStart(2, '0')}:${String(Math.floor(rnd() * 60)).padStart(2, '0')}`,
    })
  }
  const roster = people.filter((p) => p.status !== 'submitted')
  window.R8DATA = {
    orgs: orgs.map((o) => {
      const mine = people.filter((p) => p.orgId === o.id)
      return { ...o, sent: mine.length, approved: mine.filter((p) => p.status === 'approved').length, collected: mine.filter((p) => p.bandSerial).length }
    }),
    people: roster,
    total: roster.length,
    pendingInSheet: people.length - roster.length,
    operators: [
      { name: 'Vipin Menon', email: 'vipin@team.example', role: 'Admin', active: true, you: true },
      { name: 'Bhoopesh S', email: 'bhoopesh@team.example', role: 'Lead', active: true },
      { name: 'Salman K', email: 'salman@team.example', role: 'Approver', active: true },
      { name: 'Ravi Gowda', email: 'ravi.gate1@team.example', role: 'Issuer', active: true },
      { name: 'Farhan Sheikh', email: 'farhan.gate2@team.example', role: 'Issuer', active: true },
      { name: 'Deepa Nair', email: 'deepa.desk@team.example', role: 'Issuer', active: true },
      { name: 'Tenzin Das', email: 'tenzin@team.example', role: 'Issuer', active: false },
    ],
  }
})()
