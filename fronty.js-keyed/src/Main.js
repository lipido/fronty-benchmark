'use strict';

import Handlebars from 'handlebars'
import {
    Model
} from 'fronty.js'
import {
    ModelComponent
} from 'fronty.js'

var startTime;
var lastMeasure;
var startMeasure = function(name) {
    startTime = performance.now();
    lastMeasure = name;
}
var stopMeasure = function() {
    var last = lastMeasure;
    if (lastMeasure) {
        window.setTimeout(function() {
            lastMeasure = null;
            var stop = performance.now();
            var duration = 0;
            console.log(last + " took " + (stop - startTime));
        }, 0);
    }
}

function _random(max) {
    return Math.round(Math.random() * 1000) % max;
}

// Fronty Models
class StoreItem extends Model {
    constructor(id, label, store, selected = false) {
        super('item-' + id);
        this.id = id;
        this.label = label;
        this.store = store;
        this.selected = selected;
    }
}

class Store extends Model {
    constructor() {
        super('store');

        this.data = [];
        this.backup = null;
        this.lastSelected = null;

    }
}

class MainComponent extends ModelComponent {

    constructor(id, store) {
        super(Handlebars.compile(document.getElementById('tbody-template').innerHTML), store, id);
        this.store = store;
        this.id = 1;
    }

    buildRandomStoreItems(count = 1000) {
        var adjectives = ["pretty", "large", "big", "small", "tall", "short", "long", "handsome", "plain", "quaint", "clean", "elegant", "easy", "angry", "crazy", "helpful", "mushy", "odd", "unsightly", "adorable", "important", "inexpensive", "cheap", "expensive", "fancy"];
        var colours = ["red", "yellow", "blue", "green", "pink", "brown", "purple", "brown", "white", "black", "orange"];
        var nouns = ["table", "chair", "house", "bbq", "desk", "car", "pony", "cookie", "sandwich", "burger", "pizza", "mouse", "keyboard"];
        var data = [];
        for (var i = 0; i < count; i++)
            data.push(new StoreItem(this.id++, adjectives[_random(adjectives.length)] + " " + colours[_random(colours.length)] + " " + nouns[_random(nouns.length)], this.store));
        return data;
    }

    createNewRows(count = 1000) {
        this.store.set(() => {
            this.store.data = this.buildRandomStoreItems(count);
        });
    }

    appendRows(count = 1000) {
        this.store.set(() => {
            this.store.data = this.store.data.concat(this.buildRandomStoreItems(count));
        });
    }

    createChildModelComponent(className, element, id, modelItem) {
        if (className === 'DataItemComponent') {
            return new DataItemComponent(id, modelItem);
        }
    }

    swapRows() {
        if (this.store.data.length > 10) {
            this.store.set(() => {
                var a = this.store.data[4];
                this.store.data[4] = this.store.data[9];
                this.store.data[9] = a;
            });
        }
    }

    clear() {
        this.store.set(() => {
            this.store.data = [];
        });
    }

    updateRows(mod = 10) {
        for (let i = 0; i < this.store.data.length; i += mod) {
            this.store.data[i].set((item) => {
                item.label += ' !!!';
            });
        }
    }
}

class DataItemComponent extends ModelComponent {
    constructor(id, item) {
        super(DataItemComponent.template, item, id);
        //super(Handlebars.compile(document.getElementById('dataitem-template').innerHTML), item, id);
        this.item = item;

        this.addEventListener('click', 'span.remove', () => {
            startMeasure("delete");
            var store = this.item.store;
            store.set(() => {
                var idx = store.data.indexOf(this.item);
                if (idx !== -1) {
                    store.data.splice(idx, 1);
                }
            });
            stopMeasure();
        });
        this.addEventListener('click', '.lbl', () => {
            startMeasure("select");
            if (this.item.store.lastSelected !== undefined && this.item.store.lastSelected !== null) {
                this.item.store.lastSelected.set((item) => item.selected = false);
            }
            this.item.set(() => this.item.selected = true);

            this.item.store.lastSelected = this.item;

            stopMeasure();
        });
    }

    // Faster alternative to handlebars, give DOM directly
    static createTemplateDOM() {
        DataItemComponent.templateDOM = {};
        DataItemComponent.templateDOM.root = document.createElement('tr');

        DataItemComponent.templateDOM.root.innerHTML = '<tr>' +
            '<td class="col-md-1">{{id}}</td>' +
            '<td class="col-md-4"><a class="lbl">-</a></td>' +
            '<td class="col-md-4"><a class="remove"><span class="glyphicon glyphicon-remove remove" aria-hidden="true"></span></a></td>' +
            '<td class="col-md-6"></td>' +
            '</tr>'

        DataItemComponent.templateDOM.idText = DataItemComponent.templateDOM.root.firstChild.firstChild;
        DataItemComponent.templateDOM.labelText = DataItemComponent.templateDOM.root.firstChild.nextSibling.firstChild.firstChild;
    }
    static renderer(data) {
        DataItemComponent.templateDOM.root.setAttribute('key', 'item-' + data.id);
        DataItemComponent.templateDOM.root.setAttribute('class', data.selected ? 'danger' : '');
        DataItemComponent.templateDOM.idText.nodeValue = data.id;
        DataItemComponent.templateDOM.labelText.nodeValue = data.label;

        return DataItemComponent.templateDOM.root.cloneNode(true);
    }

}

// Use handlebars or direct DOM in the inner childs (DataItemComponent)
// 1. Handlebars (uncomment the following line)
//DataItemComponent.template = Handlebars.compile(document.getElementById('dataitem-template').innerHTML);

// 2. Direct DOM (improvement of 8%, from overall score of 1.88 -> 1.71)
//    Uncomment the following two lines
DataItemComponent.template = DataItemComponent.renderer;
DataItemComponent.createTemplateDOM();

class Main {
    constructor(props) {
        this.store = new Store();
        this.mainComponent = new MainComponent('storetable', this.store);
        this.mainComponent.start();

        document.getElementById("main").addEventListener('click', e => {

            if (e.target.matches('#add')) {
                e.preventDefault();
                //console.log("add");

                this.add();
            } else if (e.target.matches('#run')) {
                e.preventDefault();
                //console.log("run");
                this.run();
            } else if (e.target.matches('#update')) {
                e.preventDefault();
                //console.log("update");
                this.update();
            } else if (e.target.matches('#hideall')) {
                e.preventDefault();
                //console.log("hideAll");
                this.hideAll();
            } else if (e.target.matches('#showall')) {
                e.preventDefault();
                //console.log("showAll");
                this.showAll();
            } else if (e.target.matches('#runlots')) {
                e.preventDefault();
                //console.log("runLots");
                this.runLots();
            } else if (e.target.matches('#clear')) {
                e.preventDefault();
                //console.log("clear");
                this.clear();
            } else if (e.target.matches('#swaprows')) {
                e.preventDefault();
                //console.log("swapRows");
                this.swapRows();
            }

        });
    }

    printDuration() {
        stopMeasure();
    }

    run() {
        startMeasure("run");
        this.mainComponent.createNewRows(1000);
        stopMeasure();
    }

    add() {
        startMeasure("add");
        this.mainComponent.appendRows(1000);
        stopMeasure();
    }

    update() {
        startMeasure("update");

        this.mainComponent.updateRows(10);
        stopMeasure();
    }

    runLots() {
        startMeasure("runLots");
        this.mainComponent.createNewRows(10000);
        stopMeasure();
    }

    clear() {
        startMeasure("clear");
        this.mainComponent.clear();
        stopMeasure();
    }
    swapRows() {
        startMeasure("swapRows");
        this.mainComponent.swapRows();
        stopMeasure();
    }
}

new Main();