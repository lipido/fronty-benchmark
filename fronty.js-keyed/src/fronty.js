/*
  fronty.js: Component-based front-end JavaScript library
  author: lipido
*/

/** 
 *  Class representing a component, which is an object whose responsibilities
 *  are:
 *  <ul>
 *    <li>Render the HTML results of a provided
 *    {@link Component#renderer|renderer function} inside a specified element of
 *   the showing document, making as less DOM changes as possible.</li>
 *    <li>Manage nested child components. Child components are components which
 *      render in an element inside this component. When <em>this</em> Component
 *      re-renders, it restores its child's subtrees on their places. Child Components
 *      can be added manually (See {@link Component#addChildComponent}) or created
 *      dynamically by <em>this</em> Component via 
 *      custom tag elements (See {@link Component#childTags}).</li>
 *    <li>Manage event listeners, restoring them each re-rendering.</li>
 *  </ul>
 *  Components render when you call {@link Component#start|start()}, and updates each time you call the
 *  {@link Component#render|render()} function. 
 *
 * @example
 * <!-- html page -->
 * <body>
 *  <div id="mycomponent"></div>
 * </body>
 *
 * @example
 * //Javascript
 * var counter = 1;
 * var component = new Component(
 *  () => '<div>Counter: <span>'+counter+'</span></div>', // renderer function
 *  'mycomponent' // HTML element id
 *  );
 * component.start(); // first render
 * setInterval(() => {
 *    counter++; 
 *    component.render(); // component re-render
 * }, 1000);
 */
class Component {


  /**
   * Creates a new Component.
   *
   * @constructor
   * @param {Function} renderer A non-parameter function that returns HTML.
   * @param {String} htmlNodeId The id of the HTML element where this Component should 
   *                              render to.
   * @param {Array.<String>} [childTags] An optional Array of strings of custom-tags for dynamically created child Components.
   */
  constructor(renderer, htmlNodeId, childTags) {

    /**
     * The renderer function.
     *
     * @name Component#renderer
     * @type Function
     * @callback
     * @return {String} HTML content. It <strong>must</strong> return a single root element.
     * @default null
     */
    this.renderer = renderer;

    /**
     * The HTML element id where it renders into.
     * @name Component#htmlNodeId
     * @type String
     * @default null
     */
    this.htmlNodeId = htmlNodeId;

    /**
     * The optional name of custom element tags where child Components will
     * be created dynamically.<br>
     *
     * During render, if in the HTML provided by the {@link Component#renderer|renderer function}
     * one of these tags is found, the {@link Component#createChildComponent|createChildComponent()}
     * function is called.
     *
     * @name Component#childTags
     * @type String
     * @default empty array
     */
    this.childTags = (childTags) ? childTags : [];

    // do not render until the component is started with start()
    /**
     * Whether this Component is stopped.<br>
     * 
     * Stopped Components do not render.
     *
     * @name Component#stopped
     * @type Boolean
     * @default true
     */
    this.stopped = true;

    /**
     * The event listeners that this Component is managing. 
     * See {@link Component#addEventListener|addEventListener()}.
     *
     * @name Component#eventListeners
     * @type {Object.<string, {callback: Function, eventType: String}>}
     */
    this.eventListeners = [];

    this._boundEventsListener = this._eventsListener.bind(this);

    /**
     * The array of child components.
     *
     * @name Component#childComponents
     * @type Array.<Component>
     */
    this.childComponents = [];

    /**
     * The child components, arranged by their HTML element id.
     *
     * @name Component#childComponentIds
     * @type Object.<string, Component>
     */
    this.childComponentIds = {};


    this._previousVirtualDOM = null;
    this._generatedIdsCounter = 0;
    this._realDOMNodeMapping = {
      elements: {},
      text_nodes: {}
    };

    this._nodesWithFrontyComponentAttribute = [];

    this._parsingService = Component._defaultParsingService;

    this._bufferedParsingService = {
      currentHTML: '',
      counter: 0,
      start: function() {
        this.counter = 0;
        this.currentHTML = '';
        this.callbacks = [];
      },
      finish: function() {
        if (this.callbacks.length > 0) {
          this.parsedTree = document.createElement('div');
          this.parsedTree.innerHTML = this.currentHTML;

          for (let i = 0; i < this.callbacks.length; i++) {
            var callback = this.callbacks[i];
            callback();
          }
        }
      },
      callbacks: [],
      parse: function(html, callback) {
        this.currentHTML += '<div>' + html + '</div>';
        var currentCounter = this.counter;
        this.callbacks.push(() => {
          callback(this.parsedTree.childNodes[currentCounter].firstChild);
        });
        this.counter++;
      }
    };
  }


  /**
   * Gets the HTML element id where this Component should render.
   *
   * This element will be replaced with the contents of this component
   * renderer function.
   *
   * @returns {String} The HTML node id where this Component is rendered.
   */
  getHtmlNodeId() {
    return this.htmlNodeId;
  }

  /**
   * Sets the HTML element id where this Component should render.
   *
   * This element will be replaced with the contents of this component
   * renderer function.
   *
   * @param {String} htmlNodeId The HTML node id where this Component is rendered.
   */
  setHtmlNodeId(htmlNodeId) {
    this.htmlNodeId = htmlNodeId;
    this._resetVirtualDOM();
  }

  // child management
  /**
   * Adds a child Component to this Component.<br>
   *
   * The HTML element where the child Component will render into do not change
   * when <em>this</em> Component is re-rendered.
   *
   * The child component will be started or stopped if this Component is currently
   * started or stopped, respectively.
   *
   * @param {Component} component The child Component.
   */
  addChildComponent(component) {
    this.childComponents.push(component);
    this.childComponentIds[component.getHtmlNodeId()] = component;

    if (this.stopped) {
      component.stop();
    } else {
      component.start();
    }

    //component.render();
  }

  /**
   * Creates a new Component for a specified class name to be placed in a
   * given HTML element. This method is intended to be overrided
   * by subclasses.
   *
   * By default (if not overriden), this method searches for a class with
   * the same name as className and instantiates an object of this class
   * passing the id to it. In this sense, a parent component with a child element
   * containing a fronty-component="ChildComponent" attribute, will create instances
   * of ChildComponent rendering on this elememnt.<br>
   *
   * In addition, a parent Component specifying a child tag name 
   * 'ChildComponent' as this:
   * <pre>new Component(renderer, 'parentId', ['ChildComponent'])</pre>
   * will create instances of ChildComponent in all places where the tag
   * &lt;childcomponent&gt; is found in the HTML provided by the parent
   * rendereer function. However keep in mind that "custom HTML tags" can be
   * not accepted in any place, for example, as childs of a &lt;table&gt; element.
   *
   * @param {String} className The class name found in the HTML element
   * @param {Node} element The HTML element where the new child will be placed
   * @param {String} id The HTML id found in the tag.
   * @return {Component} The new created child component.
   * @see {@link Component#childTags}
   */
  createChildComponent(className, element, id) {
    var constructorFunction = eval('' + className); //jshint ignore:line

    if (constructorFunction instanceof Function) {
      return new constructorFunction(id);
    }
  }

  /**
   * Removes a child Component from this Component.<br>
   *
   * After the child removal, <em>this</em> component will re-render.
   *
   * @param {Component} component The child Component.
   */
  removeChildComponent(component) {
    var index = this.childComponents.indexOf(component);

    if (index != -1) {
      this.childComponents[index].stop();
      this.childComponents.splice(index, 1);
      delete this.childComponentIds[component.getHtmlNodeId()];
    }
    this.render();
  }

  /**
   * Gets the child Components of this Component.<br>
   *
   * @returns {Array.<Component>} The child Components.
   */
  getChildComponents() {
    return this.childComponents;
  }

  /**
   * Gets the child Components arranged by id.
   *
   * @returns {Array.<String, Component>} The child Components arranged by id.
   */
  getChildComponentsById() {
    return this.childComponentIds;
  }

  /**
   * Gets a child Component given its HTML element id.
   *
   * @param {String} id The HTML element id.
   * @returns {Component} The child Component.
   */
  getChildComponent(id) {
    return this.childComponentIds[id];
  }

  // rendering
  /**
   * Render this Component, which consists in:
   * <ol>
   * <li>Save the child Component DOM trees, because they may be moved to another place in the DOM.</li>
   * <li>Call the {@link Component#renderer|renderer function}.</li>
   * <li>Calculate the differences between the previous "virtual" DOM of this Component
   * and the new "virtual" DOM provided by the renderer function, skipping those
   * elements where child nodes are rendering.</li>
   * <li>Patch the real DOM with the previously computed differences.</li>
   * <li>Patch the previous "virtual" DOM with the previously computed differences,
   * and save it as the next previous "virtual" DOM.</li>
   * <li>Restore the child Components in their new places if they where moved to another
   * part in the DOM.</li>
   * <li>Restore event listeners in their corresponding elements, because 
   * some could be moved to another place in the DOM.</li>
   * <li>Create child nodes if new elements with tag name in
   * {@link Component#childTags} are found in the HTML.</li>
   * </ol> 
   */
  render() {

    if (this.rendering === true) {
      //avoid recursion
      return;
    }

    this.rendering = true;
    if (this.stopped || !this.htmlNodeId || this._getComponentNode() === null) {
      this.rendering = false;
      return;
    }

    this.beforeRender();

    var htmlContents = this.renderer();

    if (typeof htmlContents === 'string') {
      htmlContents = this.renderer().trim();
    }

    var newTree = document.createElement('div');

    if (typeof htmlContents === 'string') {
      var correctedHtmlContents = htmlContents;
      // construct the new tree given by the render function
      // fix: for roots starting with TR, TD or TH, they cannot be direct
      // childs of div, they must be inside of a table to parse them with 
      // innerHTML
      if (htmlContents.match(/^<tr .*/i) !== null) {
        // trees starting with TR
        correctedHtmlContents = '<table><tbody>' + htmlContents + '</tbody></table>';
      } else if (htmlContents.match(/^<t[dh] .*/i) !== null) {
        // trees starting with TD or TH
        correctedHtmlContents = '<table><tbody><tr>' + htmlContents + '</tr></tbody></table>';
      }

      this._parsingService.parse(correctedHtmlContents, (node) => {
        if (htmlContents.match(/^<tr .*/i) !== null) {
          newTree.appendChild(node.firstChild.firstChild);
        } else if (htmlContents.match(/^<t[dh] .*/i) !== null) {
          newTree.appendChild(node.firstChild.firstChild.firstChild);
        } else {


          newTree.appendChild(node);
        }
        if (newTree.childNodes.length > 1) {
          throw 'Rendering function MUST return a tree with a single root element ' + newTree.innerHTML;
        }

        this._renderNewTree(newTree.firstChild);
      });
    } else {

      newTree.appendChild(htmlContents);
      this._renderNewTree(newTree.firstChild);
    }
  }

  _renderNewTree(newTree) {
    var currentTree = null;
    var firstRender = this._previousVirtualDOM === null;

    // save child component subtrees
    var savedChildNodes = this._saveChildNodes();

    if (!firstRender) {

      // update real node mappings of children//
      var frontyIds = Object.keys(this._realDOMNodeMapping.elements);
      for (let i = 0; i < frontyIds.length; i++) {
        var frontyId = frontyIds[i];
        if (this._realDOMNodeMapping.elements[frontyId].hasAttribute('id') &&
          this.childComponentIds[this._realDOMNodeMapping.elements[frontyId].getAttribute('id')] !== undefined
        ) {
          this._realDOMNodeMapping.elements[frontyId] = this._getChildNode(this._realDOMNodeMapping.elements[frontyId].getAttribute('id'));
        }
      }
      // re-render. Restore the previous tree
      //currentTree = document.createElement('div'); //dummy element
      currentTree = this._previousVirtualDOM;

      //currentTree = currentTree.childNodes[0];



    } else {
      // first render, clean childs (maybe childs have some fronty comments that could interfere)
      currentTree = this._getComponentNode();

      // empty the destiny node
      while (currentTree.firstChild) {
        currentTree.removeChild(currentTree.firstChild);
      }
    }
    // tag tree. This process consists in add "frontyid" attributes to all
    // elements, as well as special comments just after every text node
    // in order to be able to map them to real nodes to be inserted
    if (firstRender) {
      this._tagTree(newTree);
    }




    // copy id to the root element of this component.
    if (newTree.nodeType === Node.ELEMENT_NODE /* && !newTree.childNodes[0].hasAttribute('id')*/ ) {
      newTree.setAttribute('id', this.getHtmlNodeId());
    }

    //  newTree = newTree.childNodes[0]; //move down to the root node of the new tree

    // TODO: create here a hook to preprocess newTree before comparing

    // compare the two trees: currentTree vs. newTree. 
    // This comparison is between the two virtual DOM trees
    var patches = TreeComparator.diff(currentTree, newTree, (node1, node2) => {

      if (firstRender) return 'REPLACE';

      // skip comparisons on our child's Component slots (child components are the responsible ones) 
      // The parent component, once re-rendered, should not touch children root nodes, since
      // they may have set some attributes in their root node
      if (node1.id && node2.id && node1.id == node2.id && (node1.id in this.childComponentIds)) {
        // do not replace a component slot with a node with the same id, skip this operation
        ////console.log('Component [#' + this.htmlNodeId + ']: skipping child inspection: ' + node1.id);
        return 'SKIP';
      }

      if (node1.id && (node1.id in this.childComponentIds)) {
        // we want to replace a component slot with another stuff, do complete replacement (maybe the slot is removed)
        return 'REPLACE';
      }
      if (node1.nodeType === Node.COMMENT_NODE && node1.nodeValue.match(/fronty-text-node/) !== null) {
        return 'SKIP';
      }
      return 'DIFF';
    });


    // apply patches to the REAL DOM
    TreeComparator.applyPatches(patches, ['frontyid'], (patch) => {

      // However, the patches contains nodes from the "virtual" DOM trees, not
      // of the real DOM. We need no get the real nodes thank to our 
      // frontyid -> realNode mapping.
      // Moreover, we will clone the nodes being inserted in the real DOM because
      // we will reuse these patches to also patch our current virtual DOM so nodes
      // cannot have two parents!

      patch = Object.assign({}, patch); // shallow copy of the patch

      if (patch.toReplace !== undefined &&
        (patch.toReplace.nodeType === Node.ELEMENT_NODE ||
          patch.toReplace.nodeType === Node.TEXT_NODE ||
          patch.toReplace.nodeType === Node.COMMENT_NODE)) {

        // toReplace will be the real DOM node

        patch.toReplace = this._resolveRealNode(patch.toReplace);

        if (patch.mode !== 'node-value' && patch.replacement !== undefined && patch.replacement !== null) {
          if (patch.mode !== 'swap-nodes') {
            if (patch.replacement.nodeType === Node.ELEMENT_NODE ||
              patch.replacement.nodeType === Node.COMMENT_NODE ||
              patch.replacement.nodeType === Node.TEXT_NODE) {
              // Element/Comment nodes. We clone the element to be inserted
              if (!firstRender)
                this._tagTree(patch.replacement);
              patch.replacement = patch.replacement.cloneNode(true);
            }
          } else if (patch.mode === 'swap-nodes') {
            // in swap-nodes mode, both are nodes to be found in the real DOM,
            // so we search for the replacement in the real DOM
            patch.replacement = this._resolveRealNode(patch.replacement);
          }
        }

        // index the newly inserted nodes, that is, take their frontyid attribute
        // or the comment tag and add them to the real nodes mapping
        if (patch.replacement !== undefined && patch.mode !== 'attributes' && patch.mode !== 'swap-nodes' && patch.mode !== 'node-value') {

          this._indexNodes(patch.replacement);
        }
      }
      return patch;
    });

    if (firstRender) {
      // in the first render, the next previous tree will be the current newTree
      this._previousVirtualDOM = newTree;
    } else {
      // On re-render it will be the patches previous virtual DOM
      TreeComparator.applyPatches(patches, ['frontyid']);
      this._previousVirtualDOM = currentTree;
    }

    // restore child component subtrees
    if (!firstRender) {
      this._restoreChildNodes(savedChildNodes);
    }

    this._updateEventListeners();

    this._createChildComponents();

    this.afterRender();

    this.rendering = false;
  }



  // lifecycle management
  /**
   * Stops this Component and all of its children.<br>
   *
   * Stopped Components do not render. Once this Component 
   */
  stop() {
    if (this.stopped === false) {
      this.stopped = true;

      for (let i = 0; i < this.childComponents.length; i++) {
        var child = this.childComponents[i];
        child.stop();
      }
    }
    this.onStop();
  }

  /**
   * Starts this Component and all of its children.<br>
   *
   * A Component need to be started in order to render. If this Component
   * was stopped, it will render. Once this Component has been started and
   * rendered, the {@link Component#onStart|onStart()} hook is called.
   */
  start() {
    if (this.stopped) {
      this.stopped = false;

      this._resetVirtualDOM();
      this.render();

      for (let i = 0; i < this.childComponents.length; i++) {
        var child = this.childComponents[i];
        child.start();
      }
    }
    this.onStart();
  }

  // event-listener management
  /**
   * Adds an event listener to HTML element(s) inside this Component.<br>
   *
   * Listeners added to elements controlled by this Component should be added
   * via this method, not directly to the HTML elements, because they can be
   * removed during re-render. Listeners added with this method are always 
   * restored to the elements matching the selector query after rendering.
   *
   * @param {String} eventType The event type to be added to the elements.
   * @param {String} nodesQuery A HTML selector query to find elements to
   * attach the listener to.
   * @param {Function} callback The callback function to dispatch the event.
   */
  addEventListener(eventType, nodesQuery, callback) { ///HOLA
    if (!(nodesQuery in this.eventListeners)) {
      this.eventListeners[nodesQuery] = [];
    }

    this.eventListeners.push({
      query: nodesQuery,
      callback: callback,
      eventType: eventType
    });

    var rootNode = this._getComponentNode();
    if (rootNode !== null) {
      this._getComponentNode().removeEventListener(eventType, this._boundEventsListener);
      this._getComponentNode().addEventListener(eventType, this._boundEventsListener);
    }
  }


  // Hooks

  /**
   * Hook function called by this Component before rendering. As a hook, it is
   * intended to be overriden by subclasses.
   */
  beforeRender() { //hook
  }

  /**
   * Hook function called by this Component after rendering. As a hook, it is
   * intended to be overriden by subclasses.
   */
  afterRender() { //hook
  }

  /**
   * Hook function called by this Component just after start. As a hook, it is
   * intended to be overriden by subclasses.
   */
  onStart() { //hook
  }

  /**
   * Hook function called by this Component just after stop. As a hook, it is
   * intended to be overriden by subclasses.
   */
  onStop() { //hook
  }

  // "private" methods

  _resolveRealNode(node) {
    var result = null;

    // text nodes
    if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.COMMENT_NODE) {
      let reg = /^__FTN__:([0-9]+)#/;
      let id = reg.exec(node.nodeValue)[1];
      result = this._realDOMNodeMapping.text_nodes[id];

      // element nodes
    } else if (node.hasAttribute('frontyid')) {
      var elem_id = node.getAttribute('frontyid');
      result = this._realDOMNodeMapping.elements[elem_id];
    }

    // try to find by id
    if (result === null && node.id !== undefined) {
      result = document.getElementById(node.id);
    }

    return result;
  }

  _eventsListener(event) {
    for (let i = 0; i < this.eventListeners.length; i++) {
      let listener = this.eventListeners[i];
      if (event.target.matches(listener.query) && listener.eventType === event.type) {
        event.preventDefault();
        listener.callback(event);
      }
    }
  }

  _resetVirtualDOM() {
    this._previousVirtualDOM = null;
    this._generatedIdsCounter = 0;
    this._realDOMNodeMapping = {
      elements: {},
      text_nodes: {}
    };
    this._mappingIdsOfChilds = {};
    this._nodesWithFrontyComponentAttribute = [];
  }

  _restoreChildNodes(savedChildNodes) {
    for (let i = 0; i < this.childComponents.length; i++) {
      var childComponent = this.childComponents[i];
      var childId = childComponent.getHtmlNodeId();
      if (this._getChildNode(childId) !== null && childId in savedChildNodes) {
        var currentComponentNode = this._getChildNode(childId);
        if (savedChildNodes[childId] != currentComponentNode) {
          currentComponentNode.parentNode.replaceChild(savedChildNodes[childId], currentComponentNode);
        }
      }
    }
  }

  _saveChildNodes() {
    var savedChildNodes = [];
    for (let i = 0; i < this.childComponents.length; i++) {
      var childComponent = this.childComponents[i];
      var childId = childComponent.getHtmlNodeId();
      if (this._getChildNode(childId) !== null) {
        savedChildNodes[childId] = this._getChildNode(childId);
      }
    }

    return savedChildNodes;
  }

  _getComponentNode() {
    return document.getElementById(this.getHtmlNodeId());
  }

  _getChildNode(childId) {
    return document.getElementById(childId);
  }

  _indexNodes(root) {

    if (root.nodeType === Node.ELEMENT_NODE) {
      if (root.hasAttribute('frontyid')) {
        let frontyid = root.getAttribute('frontyid');
        this._realDOMNodeMapping.elements[frontyid] = root;
        if (root.hasAttribute('id') && this.childComponentIds[root.id] !== undefined) {
          this._mappingIdsOfChilds[frontyid] = root.id;
        }

        root.removeAttribute('frontyid');
      }
      if (root.hasAttribute('fronty-component')) {
        this._nodesWithFrontyComponentAttribute.push(root);
      }
      for (let i = 0; i < root.childNodes.length; i++) {
        this._indexNodes(root.childNodes[i]);
      }
    } else if (root.nodeType === Node.TEXT_NODE || root.nodeType === Node.COMMENT_NODE) {
      let reg = /^__FTN__:([0-9]+)#/;
      let match = reg.exec(root.nodeValue);
      let id = match[1];
      root.nodeValue = root.nodeValue.substring(match[0].length);
      this._realDOMNodeMapping.text_nodes[id] = root;
    }
  }

  _tagTree(tree) {
    if (tree.nodeType === Node.ELEMENT_NODE) {
      tree.setAttribute('frontyid', this._generatedIdsCounter++);
      for (let i = 0; i < tree.childNodes.length; i++) {
        this._tagTree(tree.childNodes[i]);
      }
    } else if (tree.nodeType === Node.TEXT_NODE || tree.nodeType === Node.COMMENT_NODE) {
      tree.nodeValue = '__FTN__:' + (this._generatedIdsCounter++) + '#' + tree.nodeValue;
    }
  }

  _createChildComponents() {

    // create childs by tag
    if (!this.childComponentsByClassName) {
      this.childComponentsByClassName = {};
    }

    this._bufferedParsingService.start();

    for (let i = 0; i < this.childTags.length; i++) {
      let childTag = this.childTags[i];
      if (!this.childComponentsByClassName[childTag]) {
        this.childComponentsByClassName[childTag] = {};
      }
      var childTagElements = Array.from(this._getComponentNode().getElementsByTagName(childTag));

      for (let i = 0; i < childTagElements.length; i++) {
        var childTagElement = childTagElements[i];
        var itemId = childTagElement.getAttribute('id');

        // create component if there is no child component for this id yet
        if (!this.getChildComponent(itemId)) {
          let component = this.createChildComponent(childTag, childTagElement, itemId);
          if (component) {
            component.setHtmlNodeId(itemId);
            let prevParsingService = component._parsingService;
            component._parsingService = this._bufferedParsingService;

            this.addChildComponent(component);
            this.childComponentsByClassName[childTag][itemId] = component;
            component._parsingService = prevParsingService;
          }
        }
      }
    }


    this._bufferedParsingService.finish();


    this._bufferedParsingService.start();


    // create childs by fronty-component attribute
    if (!this._nodesWithFrontyComponentAttribute) {
      this._nodesWithFrontyComponentAttribute = [];
    }
    for (let j = this._nodesWithFrontyComponentAttribute.length - 1; j >= 0; j--) {
      var node = this._nodesWithFrontyComponentAttribute[j];
      var nodeId = node.getAttribute('id');
      var className = node.getAttribute('fronty-component');

      if (document.getElementById(nodeId) !== null) {
        if (!this.getChildComponent(nodeId)) {
          let component = this.createChildComponent(className, node, nodeId);
          if (component) {
            component.setHtmlNodeId(nodeId);

            let prevParsingService = component._parsingService;
            component._parsingService = this._bufferedParsingService;

            this.addChildComponent(component);
            if (this.childComponentsByClassName[className] === undefined) {
              this.childComponentsByClassName[className] = {};
            }
            this.childComponentsByClassName[className][nodeId] = component;
            component._parsingService = prevParsingService;
          }
        }
      } else {
        this._nodesWithFrontyComponentAttribute.splice(j, 1);
        if (this.getChildComponent(nodeId) !== null) {
          this.removeChildComponent(this.getChildComponent(nodeId));
          delete this.childComponentsByClassName[className][nodeId];
        }
      }
    }
    this._bufferedParsingService.finish();

    // clean remaining children that have disappear (these are tag based childs, fronty-component
    // childs have been deleted just before)
    var childTags = Object.keys(this.childComponentsByClassName);
    for (let i = 0; i < childTags.length; i++) {
      var childTag = childTags[i];
      var componentIdsInTag = Object.keys(this.childComponentsByClassName[childTag]);
      for (let j = componentIdsInTag.length - 1; j >= 0; j--) {
        var childComponent = this.childComponentsByClassName[childTag][componentIdsInTag[j]];

        if (
          document.getElementById(childComponent.getHtmlNodeId()) === null) {

          this.removeChildComponent(childComponent);
          delete this.childComponentsByClassName[childTag][childComponent.getHtmlNodeId()];
        }
      }
    }

  }

  // event listeners "private" methods

  _updateEventListeners() {
    var rootNode = this._getComponentNode();
    if (rootNode !== null) {
      for (let i = 0; i < this.eventListeners.length; i++) {
        let listener = this.eventListeners[i];
        rootNode.removeEventListener(listener.eventType, this._boundEventsListener);
        rootNode.addEventListener(listener.eventType, this._boundEventsListener);
      }
    }

  }
}
Component._defaultParsingService = {
  parse: (htmlContents, callback) => {
    var elem = document.createElement('div');
    elem.innerHTML = htmlContents;
    callback(elem.firstChild);
  }
};
/*********** DOM TREE DIFF & PATCH *******/
/**
 * A class to do discover differences between two DOM trees, calculating a
 * <em>patch</em>, as well as to reconcile those differences by applying the
 * <em>patch</em>
 */
class TreeComparator {

  /**
   * Compute the difference between two DOM trees, giving their root nodes.<br>
   *
   * The resulting object is a <em>patch</em> object that can be used to 
   * keep the first given tree equivalent to the second given tree.<br>
   *
   * An optional function can be provided to control how different subtrees are
   * compared. This function receives two nodes (node1, node2) and can return:
   * <ul>
   * <li>'DIFF': The comparison should be done as normal.</li>
   * <li>'SKIP': The comparison should not go deeper.</li>
   * <li>'REPLACE': The node1 should be totally replaced by the node2,
   * without going deeper</li>
   * </ul>
   * @param {Node} node1 The root element of the first tree to compare.
   * @param {Node} node2 The root element of the second tree to compare.
   * @param {Function} [comparePolicy] An (optional) callback function to be called
   * before comparing subnodes.
   */
  static diff(node1, node2, comparePolicy) {
    if (comparePolicy) {
      var actionToDo = comparePolicy(node1, node2);
      if (actionToDo === 'SKIP') {
        return [];
      } else if (actionToDo === 'REPLACE') {
        return [{
          toReplace: node1,
          replacement: node2
        }];
      } //otherwise, i.e.: 'DIFF', do nothing
    }

    var result = [];

    if (node1 !== null && node1.tagName === node2.tagName && node1.nodeType === node2.nodeType) {
      if (node1.childNodes.length > 0 || node2.childNodes.length > 0) {
        TreeComparator._compareChildren(node1, node2, comparePolicy, result);
      }
    } else {
      return [{
        toReplace: node1,
        replacement: node2
      }];
    }

    if (
      (node1.nodeType === Node.TEXT_NODE || node1.nodeType === Node.COMMENT_NODE) &&
      node1.nodeValue !== null &&
      node2.nodeValue !== null &&
      node1.nodeValue !== node2.nodeValue
    ) {
      return [{
        mode: 'node-value',
        toReplace: node1,
        replacement: node2
      }];
    }
    if (!TreeComparator._equalAttributes(node1, node2)) {
      result.push({
        mode: 'attributes',
        toReplace: node1,
        replacement: node2
      });
    }
    return result;
  }

  static _compareChildren(node1, node2, comparePolicy, result) {

    var child1pos = 0;
    var child2pos = 0;
    var insertions = 0;
    var deletions = 0;
    var child1Array = Array.from(node1.childNodes); //copy node1 childs to an array, sinde we will do some swaps here, but we do not want to do them in DOM now

    var keyElementIndexNode1 = {};
    var keyElementIndexNode2 = {};
    TreeComparator._buildChildrenKeyIndex(node1, node2, keyElementIndexNode1, keyElementIndexNode2);
    while (child1pos < node1.childNodes.length && child2pos < node2.childNodes.length) {
      var child1 = child1Array[child1pos];
      var child2 = node2.childNodes[child2pos];

      if (child1.nodeType === Node.ELEMENT_NODE && child2.nodeType === Node.ELEMENT_NODE) {
        var key1 = child1.getAttribute('key'); // maybe null (no-key)
        var key2 = child2.getAttribute('key'); // maybe null (no-key)

        if (key1 !== key2) {
          if ((key1 in keyElementIndexNode2) && (key2 in keyElementIndexNode1)) {

            //both nodes are in the initial and final result, so we only need to swap them
            result.push({
              mode: 'swap-nodes',
              toReplace: child1,
              replacement: node1.childNodes[keyElementIndexNode1[key2].pos]
            });
            TreeComparator._swapArrayElements(child1Array, child1pos, keyElementIndexNode1[key2].pos);

          } else {
            //both nodes are NOT in the initial and final result
            if (!(key2 in keyElementIndexNode1)) {
              // if a key element in the new result is missing in the current tree, we should insert it
              result.push({
                mode: 'insert-node',
                toReplace: node1,
                replacement: child2,
                beforePos: child1pos + insertions - deletions
              });
              insertions++;
              child2pos++;

            }
            // and if a key element in the current result is missing in the new result, we should remove it
            if (!(key1 in keyElementIndexNode2)) {
              result.push({
                mode: 'remove-node',
                toReplace: child1
              });
              child1pos++;
              deletions++;

            }
          }

        } else {
          // both keys are equals (same key OR both null)
          result.push.apply(result, TreeComparator.diff(
            child1,
            child2,
            comparePolicy));

          child1pos++;
          child2pos++;
        }
      } else if (child1.nodeType !== Node.ELEMENT_NODE && child2.nodeType === Node.ELEMENT_NODE) {
        result.push({
          mode: 'remove-node',
          toReplace: child1
        });
        child1pos++;
        deletions++;
      } else if (child1.nodeType === Node.ELEMENT_NODE && child2.nodeType !== Node.ELEMENT_NODE) {
        result.push({
          mode: 'insert-node',
          toReplace: node1,
          replacement: child2,
          beforePos: child1pos + insertions - deletions
        });
        insertions++;
        child2pos++;
      } else if (child1.nodeType !== Node.ELEMENT_NODE && child2.nodeType !== Node.ELEMENT_NODE) {
        var partial =
          TreeComparator.diff(
            child1,
            child2,
            comparePolicy);
        result.push.apply(result, partial);

        child1pos++;
        child2pos++;
      }

    }

    if (child1pos < node1.childNodes.length) {
      for (let i = child1pos; i < node1.childNodes.length; i++) {
        result.push({
          mode: 'remove-node',
          toReplace: node1.childNodes[i]
        });
      }
    } else if (child2pos < node2.childNodes.length) {
      for (let j = child2pos; j < node2.childNodes.length; j++) {
        result.push({
          mode: 'append-child',
          toReplace: node1,
          replacement: node2.childNodes[j]
        });
      }
    }
  }

  static _swapArrayElements(arr, indexA, indexB) {
    var temp = arr[indexA];
    arr[indexA] = arr[indexB];
    arr[indexB] = temp;
  }

  static _buildChildrenKeyIndex(node1, node2, keyElementIndexNode1, keyElementIndexNode2) {

    //check if node2 children are all key-based 
    var child1pos = -1;
    for (let i = 0; i < node2.childNodes.length; i++) {
      let node = node2.childNodes[i];
      child1pos++;
      if (node.nodeType === Node.ELEMENT_NODE) {
        let key = node.getAttribute('key');
        if (key) {
          keyElementIndexNode2[key] = {
            node: node,
            pos: child1pos
          };
        }
      }
    }

    var child2pos = -1;
    for (let i = 0; i < node1.childNodes.length; i++) {
      let node = node1.childNodes[i];
      child2pos++;
      if (node.nodeType === Node.ELEMENT_NODE) {
        let key = node.getAttribute('key');
        if (key) {
          keyElementIndexNode1[key] = {
            node: node,
            pos: child2pos
          };
        }
      }
    }
    //  return check;
    return true;
  }

  static _equalAttributes(node1, node2) {
    if (!node1.attributes && !node2.attributes) {
      return true;
    }

    if (!node1.attributes && node2.attributes ||
      node1.attributes && !node2.attributes) {
      return false;
    }

    var skipAttributes = (attribute) => {
      return attribute.name !== 'frontyid'; //TODO: receive this id as paremeter
    };
    var node1Attributes = Array.from(node1.attributes).filter(skipAttributes);
    var node2Attributes = Array.from(node2.attributes).filter(skipAttributes);

    if (
      node1Attributes &&
      node1Attributes.length != node2Attributes.length) {
      return false;
    } else if (node1Attributes) {
      for (let i = 0; i < node1Attributes.length; i++) {
        //if (node1Attributes[i].name === 'frontyid') continue;
        if (node1Attributes[i].name != node2Attributes[i].name ||
          node1Attributes[i].value != node2Attributes[i].value) {
          return false;
        }
      }
    }
    return true;
  }

  static _swapElements(obj1, obj2) {
    var temp = document.createElement("div");
    obj1.parentNode.insertBefore(temp, obj1);
    obj2.parentNode.insertBefore(obj1, obj2);
    temp.parentNode.insertBefore(obj2, temp);
    temp.parentNode.removeChild(temp);
  }

  /**
   * Applies the patches to the current DOM.
   *
   * @param patches Patches previously computed with {@link TreeComparator.diff}
   */
  static applyPatches(patches, skipAttributes, patchMapping) {
    for (let i = 0; i < patches.length; i++) {
      var patch = patches[i];
      if (patchMapping !== undefined) {
        patch = patchMapping(patch);
      }
      // HTML nodes
      var toReplace = patch.toReplace;
      var replacement = patch.replacement;
      switch (patch.mode) {
        case 'attributes':
          var attribute = null;
          for (let i = 0; i < replacement.attributes.length; i++) {
            attribute = replacement.attributes[i];
            if (attribute.name === 'value' &&
              toReplace.value != attribute.value) {
              toReplace.value = attribute.value;
            }
            if (attribute.name === 'checked') {
              toReplace.checked =
                (attribute.checked !== false) ? true : false;
            }

            if (skipAttributes === undefined || skipAttributes.indexOf(attribute.name) === -1 || !toReplace.hasAttribute(attribute.name)) {
              toReplace.setAttribute(attribute.name, attribute.value);
            }
          }

          for (let j = toReplace.attributes.length - 1; j >= 0; j--) {
            attribute = patch.toReplace.attributes[j];
            if (!replacement.hasAttribute(attribute.name)) {
              if (attribute.name === 'checked') {
                toReplace.checked = false;
              }
              toReplace.removeAttribute(attribute.name);
            }
          }
          break;
        case 'node-value':
          let reg = /^(__FTN__:[0-9]+#)/;
          let match = reg.exec(patch.toReplace.nodeValue);
          let tag = '';
          if (match !== null) {
            tag = match[1];
          }
          patch.toReplace.nodeValue = tag + patch.replacement.nodeValue;

          break;
        case 'remove-node':
          patch.toReplace.parentNode.removeChild(patch.toReplace);
          break;
        case 'append-child':
          patch.toReplace.appendChild(patch.replacement);
          break;
        case 'insert-node':
          if (patch.toReplace.childNodes.length === 0) {
            patch.toReplace.appendChild(patch.replacement);
          } else {
            patch.toReplace.insertBefore(patch.replacement, patch.toReplace.childNodes[patch.beforePos]);
          }
          break;
        case 'swap-nodes':
          TreeComparator._swapElements(patch.toReplace, patch.replacement);
          break;
        default:
          toReplace.parentNode.replaceChild(replacement, toReplace);
      }
    }
  }
}

/**
 * A Model is a general-purpose, observable object, holding user specific data.
 *
 *  The object can receive <em>observer functions</em> (via 
 * {@link Model#addObserver|addObserver()} function), which will be notified
 *  when the {@link Model#set|set( callback )} method of this object is called.
 *
 */
class Model {

  /**
   * Creates an instance of a Model.
   *
   * @param {String} [name=--unnamed model--] A name for the model
   */
  constructor(name) {
    /**
     * The set of observer functions to be called when this Model is changed
     * via {@link Model#set|set()} method.
     */
    this.observers = [];

    /**
     * The name of the model.
     * @type {String}
     */
    this.name = name ? name : '--unnamed model--';
  }

  /**
   * Method to update the this Model.<br>
   * A callback function is passed which is, typically, in charge to make changes 
   * in this object. When this callback returns, observers of this Model are
   * notified.
   * @example
   *  Model m = new Model('mymodel');
   *  m.set( () => { m.itemName='Tablet'; m.price=1200});
   * 
   * @param {Function} update The callback function in charge of changing this 
   *        Model. The function will receive the reference to this Model as 
   *        parameter.
   * @param {Object} [hint] Any additional object to be passed to
   *         {@link Model#observers|observers} during notification.
   */
  set(update, hint) {
    update(this);
    this.notifyObservers(hint);
  }

  /**
   * Invokes all {@link Model#observers|observers}.
   *
   * @param {Object} [hint] An optional object to pass as argument to observers.
   */
  notifyObservers(hint) {
    for (let i = 0; i < this.observers.length; i++) {
      let observer = this.observers[i];
      observer(this, hint);
    }
  }

  /**
   * Adds an observer function to this Model.<br>
   * 
   * @param {Function} observer The observer to add.
   * @see {@link Model#observers}
   */
  addObserver(observer) {
    this.observers.push(observer);
    //console.log('Model [' + this.name + ']: added observer, total: ' + this.observers.length);
  }

  /**
   * Removes an observer function from this Model.<br>
   *
   * The function will no longer be notified of changes in this Model.
   *
   * @param {Function} observer The observer to be removed.
   */
  removeObserver(observer) {
    if (this.observers.indexOf(observer) != -1) {
      this.observers.splice(this.observers.indexOf(observer), 1);
      //console.log('Model [' + this.name + ']: removed observer, total: ' + this.observers.length);
    }
  }
}


/** 
 * Class representing a model-based Component.<br>
 *
 * A ModelComponent is a Component which <em>auto-renders</em> itself when a
 * given {@link Model|model} object changes. This model object is also passed to this
 * Component's {@link Component#renderer|renderer function} each time this
 * Component is rendered.
 *
 * @example
 * <!-- html page -->
 * <body>
 *  <div id="mycomponent"></div>
 * </body>
 *
 * @example
 * // Javascript
 * // Model
 * var model = new Model();
 * model.counter = 0;
 *
 * // The ModelComponent to render the Model
 * var component = new ModelComponent(
 *  (m) => '<div>Counter: <span>'+m.counter+'</span></div>', // renderer function
 *  model, //the model
 *  'mycomponent' // HTML element id
 *  );
 *
 * component.start(); // first render
 *
 * // Make changes in Model to fire re-renders
 * setInterval(() => {
 *    model.set( () => model.counter++); // model update -> automatic re-render!
 * }, 1000);
 * @extends Component
 */
class ModelComponent extends Component {

  /**
   * Creates a new ModelComponent.
   *
   * @param {Function} modelRenderer A renderer function which accepts a
   * {@link Model} as argument.
   * @param {Model|Array.<Model>} model The model or an array of models. In case of
   * an array is passed, the renderer function will receive a single model object
   * which combines all the properties of those models.
   * @param {String} htmlNodeId The id of the HTML element where this Component should 
   *                              render to.
   * @param {Array.<String>} [childTags] An optional Array of strings of custom-tags for dynamically created child Components.
   */
  constructor(modelRenderer, model, htmlNodeId, childTags) {
    super(
      // the renderer function wraps the modelRenderer function in order to
      // pass the model to the modelRenderer.
      () => {
        return modelRenderer(this._mergeModelInOneObject());
      },
      htmlNodeId, childTags
    );

    if (!model) {
      /**
       * The models this ModelComponent is handling
       * @type {Array.<Model>}
       */
      this.models = [];
    } else if (model instanceof Model) {
      this.models = [model];
    } else if (model instanceof Array) {

      for (let i = 0; i < model.length; i++) {
        let modelItem = model[i];
        if (!(modelItem instanceof Model)) {
          throw 'Component [' + this.htmlNodeId + ']: the model must inherit Model';
        }
      }

      this.models = model;
    } else {
      throw 'Component [' + this.htmlNodeId + ']: the model must inherit Model';
    }

    this.updater = this.update.bind(this); // the update function bound to this
  }

  /**
   * The observer function added to all models this ModelComponent manages.<br>
   * This function simply calls {@link ModelComponent#render|render}, but
   * you can override it.
   *
   * @param {Model} model The model that has been updated.
   */
  update(model) {
    //console.log('Component [#' + this.htmlNodeId + ']: received update from Model [' + model.name + ']');
    this.render();
  }

  // lifecycle management
  stop() {

    if (this.stopped === false) {
      for (let i = 0; i < this.models.length; i++) {
        let model = this.models[i];
        model.removeObserver(this.updater);
      }
    }
    super.stop();
  }

  start() {
    if (this.stopped) {
      for (let i = 0; i < this.models.length; i++) {
        let model = this.models[i];
        model.addObserver(this.updater);
      }
    }
    super.start();
  }

  _mergeModelInOneObject() {
    var context = {};
    for (let i = 0; i < this.models.length; i++) {
      let model = this.models[i];
      context = Object.assign(context, model);
    }
    return context;
  }

  /** 
   * Overrides the child Component creation by also considering a "model"
   * attribute in the tag.<br>
   * The model attribute is evaluated with eval() and calls 
   * {@link ModelComponent#createChildModelComponent}.
   * @example
   * <!-- How to add a model attribute in the HTML child tag -->
   * <childcomponent id="child-0" model="items[0]">
   *
   * @param {String} tagName The HTML tag name used to place the new child Component
   * in the parent HTML
   * @param {Node} childTagElement The HTML element where the new Child will be placed
   * @param {String} id The HTML id found in the tag.
   * @return {Component} The new created child Component.
   * @see {@link Component#childTags}
   */
  createChildComponent(className, element, id) {
    var oneModelObject = this._mergeModelInOneObject();
    var modelItem = null;
    if (element.getAttribute('model')) {
      modelItem = eval('oneModelObject.' + element.getAttribute('model')); //jshint ignore:line
    }
    return this.createChildModelComponent(className, element, id, modelItem);
  }

  /**
   * This method searches for a class with the name of the className parameter
   * with a constructor taking two attributes: id and model.<br>
   * If you have components with different constructors or this policy does not
   * adapt to your needs, you can override this method.
   *
   * @param {String} className The class name found in the element
   * @param {Node} element The HTML element where the new child will be placed
   * @param {String} id The HTML id found in the element.
   * @param {Object} modelItem a model object for the new Component.
   * @return {Component} The new created child component.
   */
  createChildModelComponent(className, element, id, modelItem) {
    var constructorFunction = eval('' + className); //jshint ignore:line

    if (constructorFunction instanceof Function) {
      return new constructorFunction(id, modelItem);
    }
  }
}

/**
 *  Class representing a router component.<br>
 *  
 *  A router is reponsible of parsing the current browser location 
 *  mapping its current hash to "pages". Each time the location is
 *  changed, the router tries to replace the inner HTML in a given html node id
 *  element.Pages are:
 * <ol>
 *    <li>A Component, which will render the page contents.</li>
 *    <li>Some other options, such as title.</li>
 *  </ol>
 *  You have to define your by calling {@link RouterComponent#setRouterConfig}.<br>
 *  Finally, calling start() will try to go to the page indicated by the hash, rendering
 *  its contents.<br>
 *  The RouterComponent is a {@link ModelComponent} because it has an own Model
 *  containing the "currentPage" property.
 *
 * @example
 * var router = new RouterComponent(
 *      // id of the HTML element where router renders.
 *      'router', 
 *      //HTML of the router.
 *      () => "<div id='router'><div id='maincontent'></div></div>", 
 *      // id inside the router where the current page component renders.
 *      'maincontent'); 
 * router.setRouterConfig(
 * {    
 *    login: { //rendered on http://<host>/<page>.html#login
 *      component: new LoginComponent(), // LoginComponent is a Component
 *      title: 'Login'
 *    },
 *    // more pages
 *    defaultRoute: 'login'
 * });
 * router.start();
 *
 * @extends ModelComponent
 */
class RouterComponent extends ModelComponent {

  /**
   * Creates a new router.<br>
   * 
   * @param {String} rootHtmlId The HTML element id where the router renders.
   * @param {Function} modelRenderer the model renderer function
   */
  constructor(rootHtmlId, modelRenderer, routeContentsHtmlId, model) {

    // add a routerModel to the given model(s), creating an array
    var routerModel = new Model('RouterModel');

    if (model instanceof Array) {
      model.push(routerModel);
    } else if (model !== null && model !== undefined) {
      model = [routerModel, model];
    } else {
      model = routerModel;
    }

    super(modelRenderer, model, rootHtmlId);

    this._routerModel = routerModel;
    this.routes = {};

    this._routerModel.currentPage = this._calculateCurrentPage();

    this.pageHtmlId = routeContentsHtmlId;

    window.addEventListener('hashchange', () => {
      //console.log("Router: page changed");
      this._routerModel.set(() => {
        this._routerModel.currentPage = this._calculateCurrentPage();
      });
    });
  }

  /**
   * This function overrides the {@link ModelComponent#update}, by also 
   * checking if the model being changed is this RouterComponent's model. In
   * such a case, the RouterComponent goes to the page the model indicates.
   *
   * @param {Model} model The model that has been updated.
   */
  update(model) {
    super.update(model);
    if (model == this._routerModel) {
      this._goToCurrentPage();
    }
  }

  /**
   * Sets the router configuration. This configuration basically maps
   * URL hashes to Components that should be showed.
   *
   * @param {Object.<String, {component: Component, title: String}>}
   * routerConfig Mapping of URL hashes to pages.
   * 
   * @example
   * router.setRouterConfig(
   * {    
   *    login: { //rendered on http://<host>/<page>.html#login
   *      component: new LoginComponent(), // LoginComponent is a Component
   *      title: 'Login'
   *    },
   *    // more pages
   *    defaultRoute: 'login'
   * });
   */
  setRouterConfig(routerConfig) {
    this.routes = routerConfig;
    this._routerModel.currentPage = this._calculateCurrentPage();
  }

  onStart() {
    this._goToCurrentPage();
  }

  /**
   * Displays to an specified page. Pages are defined in 
   * {@link RouterComponent#setRouterConfig}
   *
   * @param {String} route The route to go. Example: 'login'
   */
  goToPage(route) {
    window.location.hash = '#' + route;
  }

  /**
   * Gets the current page being shown.
   * @return {String} The current page.
   */
  getCurrentPage() {
    return this._routerModel.currentPage;
  }

  /**
   * Gets this the model of this router.<br>
   *
   * The router contains an internal model where the current page is stored 
   * (among those models provided in the constructor). You can obtain this
   * internal model by calling this function.
   *
   * @return {Model} The model of this router.
   */
  getRouterModel() {
    return this._routerModel;
  }

  /**
   * Gets a query parameter of the current route.<br>
   *
   * Note: <em>route query parameters</em> are NOT the standard URL query
   * parameters, which are specified BEFORE the hash.<br>
   *
   * For example, if the current URL is 'index.html#login?q=1',
   * a call to getRouteQueryParam('q') returns 1.
   *
   * @param {String} name The name of the route query parameter.
   * @return The value of the router query parameter.
   */
  getRouteQueryParam(name) {
    var queryString = window.location.hash.replace(/#[^\?]*(\?.*)/, "$1");
    name = name.replace(/[\[\]]/g, "\\$&");
    var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
      results = regex.exec(queryString);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, " "));
  }

  _calculateCurrentPage() {
    var currentPage = window.location.hash.replace(/#([^\\?]*).*/, "$1");
    if (currentPage.length === 0 && this.routes.defaultRoute) {
      currentPage = this.routes.defaultRoute;
    }
    return currentPage;

  }
  _goToCurrentPage() {
    var currentPage = this.getCurrentPage();

    if (currentPage) {

      // get page component and update the main body element
      if (currentPage in this.routes) {
        if (this.routes[currentPage].title) {
          document.title = this.routes[currentPage].title;
        }

        // stop the previous component
        if (this.currentComponent) {
          this.currentComponent.stop();
        }
        this.removeChildComponent(this.currentComponent);

        // start the new page's component
        this.currentComponent = this.routes[currentPage].component;
        this.currentComponent.setHtmlNodeId(this.pageHtmlId);

        this.addChildComponent(this.currentComponent);
        this.routes[currentPage].component.start();

      } else {
        //console.log('Router undefined page ' + currentPage);
      }
    } else {
      //console.log('Router: no default page defined');
    }
  }
}
export {
    Model,
    ModelComponent,
    Component,
    RouterComponent
}