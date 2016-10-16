let documentationModeIterator = 0
const eventQueue = []
const eventLog = []
const state = {}
var filterFSMId = undefined
var filterIds = []

const init = (configFile) => {
    if (!_(`init_script_${configFile}`)) {
        var xhr = new XMLHttpRequest()
        xhr.onreadystatechange = function(){
          if(xhr.status == 200 && xhr.readyState == 4){
            config = JSON.parse(xhr.responseText)
          }
        }
        xhr.open("GET",`configs/${configFile}.js`,true)
        xhr.send()
    }
}

const log = (message, _color, from, to, json, fsmId, aggregate) => {
    const fromId = safeId('component_' + from)
    const toId = safeId('component_' + to)
    const isFlyingMessage = typeof from !== 'undefined' && typeof to !== 'undefined' && from && to

    quantity = 1
    if (Array.isArray(json)) {
        quantity = json.length
        if (quantity == 1) {
            json = json[0]
        }
    }

    const existingSelector = `.logline[data-from='${fromId}'][data-to='${toId}'][data-fsm-id='${fsmId}']`
    if (aggregate && isFlyingMessage && _(existingSelector)) {
        const current = parseInt(_(`${existingSelector} .quantity-wrapper`).innerHTML)
        _(`${existingSelector} .quantity-wrapper`).innerHTML = current + quantity
        return
    }

    const colors = {
        'severe':'#E53A40',
        'error': '#E53A40',
        'warning': '#FFBC42',
        'info': 'inherit',
        'trace': '#6E7783',
        'debug': '#6E7783',
        'happy': '#2f751b',
        'default': 'inherit'
    }

    const color = colors[_color] || colors['default']
    const fsmIdWrapper = '<span class="fsm-id-wrapper"></span>'

    const quantityDisplay = quantity > 1 ? 'inline' : 'none'
    const quantityWrapper = `<span class="quantity-section" style="display:${quantityDisplay}"><span> × </span><span class="quantity-wrapper">${quantity}</span></span>`

    const header = isFlyingMessage ? `<div class='log-header'>` + fsmIdWrapper + minibox(fromId, from) + `<span> → </span>` + minibox(toId, to) + quantityWrapper + `</div>` : ''

    const prettyJson = json ? '<pre>' + syntaxHighlight(json) + '</pre>' : '';

    const element = document.createElement('span')
    element.id = 'log_' + guid()
    element.className = 'logline'
    element.style.color = color
    element.innerHTML = header + `<div class='log-content'>` + (message ? message + '<br/>' : '') + prettyJson + '</div>'
    element.dataset.fsmId = fsmId
    element.dataset.from = fromId
    element.dataset.to = toId

    if (!isFlyingMessage) {
        element.dataset.always = 'true'
    }

    _('#log').insertBefore(element, _('#log').firstChild)

    if (isFlyingMessage && typeof fsmId !== 'undefined') {
        addFilteringFSMId(fsmId, _('#' + element.id + ' .fsm-id-wrapper'), false)
    }

    // hide if being filtered out
    if (isFlyingMessage) {
        if ((filterFSMId && filterFSMId != fsmId) || (filterIds.length && filterIds.indexOf(fromId) == -1 && filterIds.indexOf(toId) == -1)) {
            element.style.display = 'none'
        }
    }

    while (_('#log').children.length > 1000) {
        _('#log').removeChild(_('#log').lastElementChild)
    }
}

const updateFilters = () => {
    if (filterFSMId || filterIds.length) {
        __('.logline:not([data-always])').forEach((e) => e.style.display = 'none')
        __('.moon').forEach((e) => e.style.display = 'none')

        const fFSMIdSel = filterFSMId ? `[data-fsm-id='${filterFSMId}']` : ''
        const fIdsSel = filterIds.length
            ?
                filterIds.map((i) => `.logline[data-from='${i}']${fFSMIdSel}, .logline[data-to='${i}']${fFSMIdSel}`).join(', ')
            :
                `.logline${fFSMIdSel}`

        __(fIdsSel).forEach((e) => e.style.display = 'block')
        __(`.moon${fFSMIdSel}`).forEach((e) => e.style.display = 'inline-block')

        // init filter section
        while (_('#filter-content').firstChild) { _('#filter-content').removeChild(_('#filter-content').firstChild) }
        _('#filter-content').innerHTML = "<span>Showing only:<span>";
        if (filterFSMId) addFilteringFSMId(filterFSMId, _('#filter-content'), true)
        filterIds.forEach((i) => { addFilteringID(i, _('#filter-content'), true) })
        _('#filter').style.display = 'block'

        return
    }

    _('#filter').style.display = 'none'
    __('.logline').forEach((e) => e.style.display = 'block')
    __('.moon').forEach((e) => e.style.display = 'inline-block')
}

const addFilteringFSMId = (fsmId, parent, addListener) => {
    const rgb = stringToRGBA(fsmId)

    const filteringFSMId = document.createElement('span')
    filteringFSMId.className = 'filtering-fsm-id'
    filteringFSMId.style.background = `linear-gradient(${rgb}, ${rgb}), url(images/message.gif)`
    parent.appendChild(filteringFSMId)

    // filtering listener
    if (addListener) {
        filteringFSMId.onclick = function () {
            filterFSMId = undefined
            parent.removeChild(this)
            updateFilters()
        }
    }

    // Create tooltip
    const tooltip = document.createElement('span')
    tooltip.className = 'tooltip'
    tooltip.innerHTML = textLimit(fsmId, 20)
    filteringFSMId.appendChild(tooltip)
}

const addFilteringID = (id, parent, addListener) => {
    const color = _('#' + id).style.backgroundColor
    const safeLabel = textLimit(_('#' + id + " span").innerHTML, 20)

    const filteringID = document.createElement('span')
    filteringID.className = 'filtering-id'
    filteringID.style.background = color
    filteringID.innerHTML = safeLabel
    parent.appendChild(filteringID)

    // filtering listener
    if (addListener) {
        filteringID.onclick = function () {
            filterIds.splice(filterIds.indexOf(id), 1)
            parent.removeChild(this)
            updateFilters()
        }
    }
}

const run = (timeout) => {
    if (typeof config !== 'undefined') {
        if (brokersOverride) {
            config.kafka.brokers = brokersOverride
            log(`Overriding brokers to [${brokersOverride}]`)
        }
        if (fsmId) {
            config.fsmId = fsmId
            config.kafka.offset = String(offset)
            log(`Grepping messages for [${fsmId}], with an offset of [${offset}]`)
        }
        doRun()
    } else if (timeout > 0) {
        console.log("not ready; retrying...")
        window.setTimeout(() => run(timeout - 1), 50)
    } else {
        log('Did you add .js to it? (you shouldn\'t)', 'error')
        log('Is the ?config=xxx filename wrong?', 'error')
        log('Did you break the JSON syntax?', 'error')
        log('Cannot load configuration file', 'error')
        _('#title').innerHTML = 'Flowbro is drunk :('
    }
}

const doRun = () => {
    _('#title').innerHTML = textLimit(config.title, 25)
    loadComponents(config)

    window.setInterval(() => showNextUiEvent(), config.eventSeparationIntervalMilliseconds)

    if (!config.documentationMode) {
        openWebSocket()
        // _('#rest').innerHTML = '<button onclick="javascript:replayEventLog()">Replay</button><button onclick="javascript:cleanEventLog()">Clear</button>'
    } else {
        // _('#rest').innerHTML = '<button onclick="javascript:resetDocumentationMode()">Reset</button><button onclick="javascript:mockPoll()">Next</button>'
    }
}

const showNextUiEvent = () => {
    if (eventQueue.length == 0) {
        return
    }

    let event = eventQueue.shift()

    while (typeof event !== 'undefined' && event.eventType != 'message') {
        if (event.text) {
            log(event.text, event.color, event.sourceId, event.targetId, event.json, event.fsmId)
        }
        event = eventQueue.shift()
    }

    if (eventQueue.length == 0) {
        return
    }

    if (event.eventType == 'message') {
        const safeSourceId = safeId(event.sourceId)
        const safeTargetId = safeId(event.targetId)

        animateFromTo(
            _(`[id='component_${safeSourceId}']`),
            _(`[id='component_${safeTargetId}']`),
            event.quantity ? event.quantity : 1,
            event.fsmId
        )
    }
    if (event.text) {
        log(event.text, event.color, event.sourceId, event.targetId, event.json, event.fsmId, event.aggregate)
    }

    // Save enqueued animation into event log; keep it <= 100 events
    if (!config.documentationMode) {
        eventLog.push([event])
        if (eventLog.length > 100)
            eventLog.shift()
        _('#event-log').innerHTML = `${eventLog.length} events logged`
    }
}

const openWebSocket = () => {
    const wsUrl = "ws://" + config.webSocketAddress + "/ws"
    const ws = new WebSocket(wsUrl)

    ws.onopen = (event) => {
        log(`WebSocket open on [${wsUrl}]!`, 'happy')
        try {
            ws.send(JSON.stringify(config))
            log("Sent configurations to server successfully!", 'happy')
        } catch(e) {
            log("Server is drunk :( can't send him configurations!", 'error')
            console.log(e)
        }
    }

    ws.onmessage = (message) => {
        if (!config.documentationMode) {
            try{
                processUiEvents(JSON.parse(message.data))
            } catch (e) {
                console.log(`Couldn't parse this as JSON: ${message.data}`, "\nError: ", e)
            }
        } else if (!config.hideIgnoredMessages) {
            console.log('Ignored incoming message', message.data)
            log('Ignored incoming message.', 'debug')
        }
    }

    ws.onclose = (event) => log("WebSocket closed!", 'error')
    ws.onerror = (event) => log(`WebSocket had error! ${event}`, 'error')
}

const processUiEvents = (events) => {
    for (event of events) {
        if (!config.documentationMode) {
            event.quantity = Array.isArray(event.json) ? event.json.length : 1
        }
        eventQueue.push(event)
    }
}

const cleanEventLog = () => { eventLog.length = 0; log('-- Replay event log is now empty --', 'debug'); }
const replayEventLog = () => {
    if (eventLog.length > 0) {
        config.documentationMode = true
        documentationModeIterator = 0
        config.documentationSteps = eventLog
        eventQueue.length = 0
        refreshDocumentationModeStepCount()
        log('-- Replay event log mode; ignoring real-time messages --', 'happy')
        _('#rest').innerHTML = '<button onclick="javascript:resetDocumentationMode()">|&lt;&lt;</button><button onclick="javascript:mockPoll()">&gt;</button><button onclick="javascript:restoreRealTime()">Back</button>'
    } else {
        log('-- Replay event log is empty --', 'error')
    }
}
const restoreRealTime = () => {
    config.documentationSteps.length = 0
    documentationModeIterator = 0
    config.documentationMode = false
    eventLog.length = 0
    log('-- Back to real-time mode --')
    _('#rest').innerHTML = '<button onclick="javascript:replayEventLog()">Replay</button><button onclick="javascript:cleanEventLog()">Clear</button>'
}

const resetDocumentationMode = () => {
    documentationModeIterator = 0
    refreshDocumentationModeStepCount()
    log('-- reset --', 'debug')
}

const mockPoll = () => {
    newEvents = config.documentationSteps[documentationModeIterator] ? config.documentationSteps[documentationModeIterator++] : []
    refreshDocumentationModeStepCount()
    processUiEvents(newEvents)
}
const refreshDocumentationModeStepCount = () => {
    _('#event-log').style.display = 'block';
    _('#event-log').innerHTML = `${documentationModeIterator}/${config.documentationSteps.length} events`
}

const loadComponents = (config) => {
    let colorRing = colorGenerator(config.colourPalette)
    for (let i in config.components) {
        const component = config.components[i]
        const safeComponentId = safeId(component.id)

        let element = document.createElement('div')
        element.id = `component_${safeComponentId}`
        element.className = 'component'
        element.dataset.clicked = -1

        _('#container').appendChild(element)

        if (component.backgroundColor) {
            element.style.backgroundColor = component.backgroundColor
        }

        element.style.width = component.width ? component.width : "150px"
        element.style.height = component.height ? component.height : "100px"

        const position = componentPosition(config.components, i)
        element.style.left = position.left
        element.style.top = position.top

        if (component.img) {
            const img = document.createElement('img')
            img.src = config.images[component.img]
            element.appendChild(img)
        } else {
            const title = document.createElement('span')
            title.className = 'component_title'
            title.innerHTML = component.id
            element.appendChild(title)
            element.style.backgroundColor = component.backgroundColor ? component.backgroundColor : colorRing.next().value
            title.style.marginTop = "-" + (parseInt(title.offsetHeight) / 2) + "px"
            title.style.width = parseInt(element.style.width) - 20 - 2 // 20 = padding
        }

        // filtering handler
        element.onclick = function () {
            element.dataset.clicked = element.dataset.clicked  * -1
            if (element.dataset.clicked == 1 && filterIds.indexOf(element.id) == -1) {
                filterIds.push(element.id)
            } else {
                filterIds.splice(filterIds.indexOf(element.id), 1);
            }

            //https://github.com/MarianoGappa/flowbro/issues/20
            _('#component-info').innerHTML = component.info ? minibox(element.id, component.id) + "<span> → </span>" + component.info : ''

            updateFilters()
        }

        // Moon holder
        let moonHolder = document.createElement('div')
        moonHolder.id = `${element.id}_moon_holder`
        moonHolder.className = 'moon-holder'

        _('#container').appendChild(moonHolder)
        moonHolder.style.left = parseInt(element.style.left)
        moonHolder.style.width = 300
        moonHolder.style.top = parseInt(element.style.top) + parseInt(element.style.height)
    }
}

const animateFromTo = (source, target, quantity, fsmId) => {
    const element = document.createElement('div')
    element.id = 'anim_' + guid()
    element.className = 'detached message'

    _('#container').appendChild(element)
    element.style.top = parseInt(source.offsetTop) + (parseInt(source.offsetHeight) / 2) - (parseInt(element.offsetHeight) / 2)
    element.style.left = parseInt(source.offsetLeft) + (parseInt(source.offsetWidth) / 2) - (parseInt(element.offsetWidth) / 2)

    element.style.zIndex = -1

    var rgb = undefined
    if (typeof fsmId !== 'undefined' && fsmId !== '') {
        rgb = stringToRGBA(fsmId)
    }

    if (quantity > 1) {
        const q = document.createElement('h2')
        q.innerHTML = quantity
        element.appendChild(q)
    }

    if (typeof rgb !== 'undefined') {
        element.style.background = `linear-gradient(${rgb}, ${rgb}), url(images/message.gif)`
    } else {
        element.style.background = 'url(images/message.gif)'
    }
    element.style.backgroundSize = 'cover'

    const newTop = target.offsetHeight / 2 - parseInt(element.offsetHeight) / 2 + parseInt(target.offsetTop)
    const newLeft = target.offsetWidth / 2 - parseInt(element.offsetWidth) / 2 + parseInt(target.offsetLeft)

    style = document.createElement('style')
    style.type = 'text/css'
    const styleId = `style_${guid()}`
    const length = config.animationLengthMilliseconds
    style.appendChild(document.createTextNode(`.${styleId} { top: ${newTop}px !important; left: ${newLeft}px !important; -webkit-transition: top${length}ms, left ${length}ms; /* Safari */ transition: top ${length}ms, left ${length}ms;}`))
    document.body.appendChild(style)

    element.className = `${styleId} detached message`

    const postAnimation = (element, style, target, rgb, fsmId) => () => {
        element.parentNode.removeChild(element)
        style.parentNode.removeChild(style)
        if (rgb) {
            addMoon(source, rgb, fsmId, 0)
            addMoon(target, rgb, fsmId, quantity)
        }
    }

    window.setTimeout(postAnimation(element, style, target, rgb, fsmId), length)
}

const addMoon = (target, rgb, fsmId, quantity) => {
    const moonId = target.id + "_" + fsmId
    const moonHolderId = target.id + "_moon_holder"

    if (_('#' + moonId)) {
        maybeCurrentQuantity = parseInt(_('#' + moonId + "_counter").innerHTML)
        newQuantity = maybeCurrentQuantity ? maybeCurrentQuantity + quantity : quantity
        _('#' + moonId + "_counter").innerHTML = newQuantity
        _('#' + moonId + "_counter").style.display = newQuantity <= 1 ? 'none' : 'inline-block'
        return
    }

    // Create moon
    const moon = document.createElement('div')
    moon.id = moonId
    moon.className = 'moon'
    moon.style.background = `linear-gradient(${rgb}, ${rgb}), url(images/message.gif)`
    moon.dataset.fsmId = fsmId
    moon.dataset.to = target.id
    moon.dataset.clicked = -1

    // Hide moon if currently filtered out
    if (filterFSMId && filterFSMId != fsmId) {
        moon.style.display = 'none'
    }

    _('#' + moonHolderId).appendChild(moon)

    // moon counter
    const moonCounter = document.createElement('span')
    moonCounter.id = moonId + "_counter"
    moonCounter.className = 'moon_counter'
    _('#' + moonId).appendChild(moonCounter)
    _('#' + moonId + "_counter").innerHTML = quantity ? quantity : 0
    moonCounter.style.display = quantity <= 1 ? 'none' : 'inline-block'


    // filtering listener
    moon.onclick = function () {
        moon.dataset.clicked = moon.dataset.clicked  * -1
        if (moon.dataset.clicked == 1 && filterFSMId != fsmId) {
            filterFSMId = fsmId
        } else {
            filterFSMId = undefined
        }
        updateFilters()
    };

    // Create tooltip
    const tooltip = document.createElement('span')
    tooltip.className = 'tooltip'
    tooltip.innerHTML = textLimit(fsmId, 20)
    _('#' + moonId).appendChild(tooltip)

    // Limit to 4 moons
    // if (_('#' + moonHolderId).children.length > 4) {
    //     _('#' + moonHolderId).removeChild(_('#' + moonHolderId).children[0])
    // }
}

const componentPosition = (components, i) => {
    const defaultPositions = [
        [],
        [{left: 50, top: 50}],
        [{left: 50, top: 50}, {left: 450, top: 450}],
        [{left: 50, top: 50}, {left: 50, top: 450}, {left: 450, top: 450}],
        [{left: 50, top: 50}, {left: 50, top: 450}, {left: 450, top: 50}, {left: 450, top: 450}],
        [{left: 50, top: 250}, {left: 200, top: 50}, {left: 100, top: 450}, {left: 450, top: 220}, {left: 450, top: 450}],
    ]

    const position = {}

    if (components[i].top != undefined) {
        position.top = components[i].top
    } else if (defaultPositions[components.length] != undefined) {
        position.top = defaultPositions[components.length][i].top
    } else {
        position.top = 0
    }

    if (components[i].left != undefined) {
        position.left = components[i].left
    } else if (defaultPositions[components.length] != undefined) {
        position.left = defaultPositions[components.length][i].left
    } else {
        position.left = 0
    }

    return position
}

// Brokers query param
let brokersOverride = undefined
const brokerOverrideParam = getParameterByName('brokers')
if (brokerOverrideParam) {
    brokersOverride = brokerOverrideParam
}

// Offset query param
let offset = undefined
const offsetParam = getParameterByName('offset')
if (offsetParam) {
    offset = offsetParam
}

// FSMId query param
let fsmId = undefined
const fsmIdParam = getParameterByName('fsmId')
if (fsmIdParam) {
    fsmId = fsmIdParam
    if (!offsetParam) {
        offset = -1000
    }
}

try {
    const inlineConfigParam = getParameterByName('inlineConfig', 'no_lowercase')
    if (inlineConfigParam !== null) {
        const inlineConfig = atob(inlineConfigParam)
        eval(inlineConfig)
    }
} finally {
    if (typeof config === 'undefined') {
        init(getParameterByName('config') || 'config-example')
    }
}
