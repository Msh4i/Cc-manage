// The start: draw what is known, then light up as the database answers.

// One listener per ref. A dead bridge ends only that listener, and only a fresh one recovers it.
function listen(ref, next) {
  ref.onSnapshot(next, e => {
    if (e?.code === 'unavailable') return setTimeout(() => listen(ref, next), 5000)
    note(e?.code === 'revoked' ? 'Access to this page\'s data was revoked.' : `Live connection lost (${e?.code ?? 'unknown'}). Reload the page.`)
  })
}

function subscribe() {
  listen(db.collection('sessions'), snap => {
    sessions = snap.docs.map(d => toSession(d.data())).filter(Boolean)
    note('')
    renderAll(Date.now())
  })
  listen(db.doc('usage/account'), snap => {
    usage = snap.exists ? toUsage(snap.data()) : null
    showBudgets()
    renderUsage()
  })
  listen(db.doc('control/budgets'), snap => {
    control = snap.exists ? toBudgets(snap.data()) : null
    showBudgets()
    renderUsage()
  })
  listen(db.collection('looks'), snap => {
    looks = { ...Object.fromEntries(snap.docs.map(d => [d.id, toLook(d.data())]).filter(([, l]) => l)), ...Object.fromEntries(unsavedLooks) }
    renderAll(Date.now())
  })
  listen(db.collection('requests'), snap => {
    requests = snap.docs.map(d => toRequest(d.id, d.data())).filter(Boolean).sort((a, b) => b.at - a.at)
    renderAll(Date.now())
  })
  listen(db.collection('places'), snap => {
    places = { ...Object.fromEntries(snap.docs.map(d => [d.id, toPlace(d.data())]).filter(([, p]) => p)), ...Object.fromEntries(unsavedPlaces) }
    renderAll(Date.now())
  })
}

showView(location.hash === '#panel' ? 'panel' : 'islands')
showList(recall('list') === 'map' ? 'map' : 'cards')
showBudgets()
renderUsage()
animate()
setInterval(animate, 150)
setInterval(() => renderAll(Date.now()), 5000)
// islands in motion and boats move every frame while the islands are in view
;(function voyage() {
  if (!byId('view-islands').hidden) frameIslands(Date.now())
  requestAnimationFrame(voyage)
})()

const host = window.claude
;(host ? host.use('db') : Promise.resolve(null)).then(found => {
  db = found
  if (db) return subscribe()
  lockBudgets('Can only be changed on claude.ai.')
  byId('empty-text').textContent = 'Live data opens only on claude.ai, with the page owner\'s account.'
}, () => note('Could not load the database. Reload the page.'))
