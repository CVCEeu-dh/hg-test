/**
 * @ngdoc function
 * @name histograph.controller:CoreCtrl
 * @description
 * # CoreCtrl
 * Main controller, handle socket/io bridging for notification
 * It is the parent of the other controllers. Note: It contains also partial controllers for modals.
 */
angular.module('histograph')
  
  .controller('CoreCtrl', function ($scope, $rootScope, $location, $state, $timeout, $route, $log, $timeout, $http, $routeParams, $modal, $uibModal, socket, ResourceCommentsFactory, ResourceRelatedFactory, SuggestFactory, cleanService, VisualizationFactory, EntityExtraFactory, EntityRelatedExtraFactory, localStorageService, EntityRelatedFactory, EVENTS, VIZ, MESSAGES, ORDER_BY, SETTINGS, UserFactory) {
    $log.debug('CoreCtrl ready');
    $scope.locationPath = $location.path();
    $scope.locationJson  = JSON.stringify($location.search()); 


    var suggestionTimeout = 0;
    
    $scope.params = {}; //  this would contain limit, offset, from, to and other API params. Cfr. EVENT.API_PARAMS_CHANGED
    
    // the paths followed by a single user
    $scope.trails = [];
    
    // the global timeline of resource presence.
    $scope.timeline;
    
    // playlist of nodes ... :D
    $scope.playlist = [];
    
    // playlist ids
    $scope.playlistIds = [];
    
    // the current user
    $scope.user = {};
    
    // current viewpoint (view mode)
    $scope.viewpoint = {
      isopen: false,
      available: [
        { 
          icon: 'tv',
          name: 'tv',
          label:'view everything'
        },
        {
          icon: 'columns',
          name: 'read', 
          label:'facilitate reading'
        },
        { 
          icon: 'map-o',
          name: 'network',
          label:'facilitate exploration'
        }
      ]
    };
    
    $scope.viewpoint.selected = $scope.viewpoint.available[0]
    
    // current headers for a given column. Cfr setHeader
    $scope.headers = {
      seealso: '',
      graph: ''
    };
    
    $scope.setHeader = function(key, value) {
      if(typeof key == 'object') {
        for(var i in key)
          $scope.headers[i] = key[i];
      } else
        $scope.headers[key] = value;
    }
    
    $scope.setViewpoint = function(value) {
      $scope.viewpoint.selected = value;
    }
    
    /*
      Get the current $state
    */
    $scope.getState = function() {
      return $state;
    }
    
    /*
      force start the guided tour
    */
    $scope.startGuidedTour = function() {
      $rootScope.$emit(EVENTS.START_GUIDED_TOUR);
    }
    
    // the current search query, if any
    // $scope.query =  $routeParams.query || '';
    
    // set query and redirect to search controller
    $scope.setQuery = function(item) {
      $scope.freeze = 'sigma';
      $log.log('CoreCtrl > setQuery',  arguments);
      if(typeof item == 'string')
        location ='/#/search/' + $scope.query;
      else if(item.type == 'resource')
        $location.path('r/' + item.id);
      else if(item.type == 'person')
        $location.path('e/' + item.id);
      else
        $location.path('search/' + $scope.query);
    }
    
    /*
      Handle smart related items, with pagination. dispatch event USE_PAGE
      Please cehck that each controller clean or replace this list
    */
    $scope.relatedItems = [];
    
    $scope.setRelatedItems = function(relatedItems) {
      if(!relatedItems)
        return
      $log.log('CoreCtrl > setRelatedItems', relatedItems.length);
      $scope.relatedItems = relatedItems;
    };
    
    $scope.addRelatedItems = function(relatedItems) {
      $log.log('CoreCtrl > addRelatedItems', relatedItems.length);
      $scope.relatedItems = ($scope.relatedItems || []).concat(relatedItems);
    }
    
    $scope.relatedPage = 1;
    $scope.relatedCount = 0; // total number of items
    $scope.setRelatedPagination = function(options) {
      $log.log('CoreCtrl > setRelatedPagination', options)
      $scope.relatedCount = options.total_count;
    }
    
    $scope.setPage = function(page, prefix) {
      $log.log('CoreCtrl > setPage', page, '- prefix:', prefix || 'without prefix');
      $scope.$broadcast(EVENTS.PAGE_CHANGED, {
        page: page,
        prefix: prefix
      });
    }
    
    $scope.addMoreItems = function() {
      $log.log('CoreCtrl > addMoreItems');
      //$scope.$broadcast(EVENTS.INFINITE_SCROLL);
    }
    /*
      Manual trigger.
    */
    $scope.more = function() {
      $scope.$broadcast(EVENTS.INFINITE_SCROLL);
    }
    
    /*
      timeline handlers
    */
    $scope.setTimeline = function(items) {
      $scope.timeline = items;
    }

    /*
      language handlers
    */
    $scope.language = 'en';
    
    $scope.availableLanguages = [
      'en', 'fr', 'de'
    ];
    
    $scope.setLanguage = function(lang) {
      $scope.language = lang
    }
    
    
    /*
      sorting order handlers.
      In children controllers, use setAvailableSortings to update the list.
    */
    
    
    $scope.availableSortings = [
      ORDER_BY.RELEVANCE,
      ORDER_BY.CLOSEST_DATE,
      ORDER_BY.ASC_DATE
    ];
    
    $scope.sorting = ORDER_BY.RELEVANCE;
    
    $scope.setAvailableSortings = function(availableSortings) {
      $scope.availableSortings = availableSortings;
    };
    
    $scope.setSorting = function(sorting) {
      if(!sorting) {
        $log.info('CoreCtrl -> setSorting() ignore undefined sorting')
        return;
      }
      if(typeof sorting == 'string') {
        var sorting = _.first(_.filter(ORDER_BY, {value: sorting}));
        if(sorting) {
          $scope.sorting = sorting;
          $location.search('orderby', sorting.value)
        }
        return;
      }
      $scope.sorting = sorting;
      if(sorting.value == 'relevance')
        $location.search('orderby', null);
      else
        $location.search('orderby', sorting.value)
    }
    
    
    /**
     handle redirection from directive
     */
    $scope.redirect = function(path) {
      $log.info('CoreCtrl redirect to', path)
      $location.path(path);
      $scope.$apply();
    };
    /*
      Will automatically update the graph view
      according tho the nodes edges propsed here.
      @param graph    - a collection of nodes and edges given as lists
      @param options.center    - (optional) a list of node ids fo set as fixed
    */
    $scope.setGraph = function(graph, options) {
      if(!graph || !graph.nodes || !graph.edges) {
        $log.warn('CoreCtrl -> setGraph() build an empty graph, response is empty')
        graph = {
          nodes: [],
          edges:[]
        };
      }
      $log.info('CoreCtrl -> setGraph', graph.nodes.length, 'nodes', graph.edges.length, 'edges')
      if(options && options.centers)
        graph.centers = options.centers;
      $scope.graph = graph;
    };

    /*
      Generic broadcaster toward sigma directive.
      You can use this function to broadcast events to sigma graph.
    */
    $scope.triggerGraphEvent = function(eventName, data) {
      $scope.$broadcast(eventName, data);
    };

    
    $scope.suggest = function(query) {
      if(query.trim().length < 2)
        return;
      // $log.info('CoreCtrl -> suggest', query);
      $scope.query = ''+ query
      $scope.freeze = 'sigma'
      return $http.get('/api/suggest', {
        params: {
          query: query
        }
      }).then(function(response){
        //console.log(response)
        return [{type:'default'}].concat(response.data.result.items)
      });
    };
    
    /*
      Open entity contextual menu
      ---------------------------
      
    */
    $scope.target;
    /*
      Open the contextual menu for something.
      
      @param e        - passed with $event, allow to repoisition the pop object
      @param item     - the item which contain the tag or the label.
      @param tag      - the entity instance for precise commenting purposes.
      @param hashtag  - istead of using target, a hashtag
    */
    $scope.toggleMenu = function(e, item, tag, hashtag) {
      $log.info('CoreCtrl -> toggleMenu()', e, item, tag)
      $scope.target = {
        event: e,
        item: item,
        tag: tag,
        hashtag: hashtag
      };
    };
    
    /*
      Commenting, everywhere
      ----------------------
    */
    $scope.commenting = false; // on commenting = true
    $scope.commented = {};
    
    $scope.comment = {
      text: "Write something please. Then do not forget to push the button below",
      tags: ''
    }
    
    // label should be in place if tag is an angular object.
    $scope.startCommenting = function(item, tag, label){
      $scope.commenting = true;
      $scope.commented = item;
      if(tag){
        if(typeof tag == 'string') {
          $scope.comment.tags = ['#' + tag];
          $scope.comment.text = '#' + tag;
        } else {
          $scope.comment.tags = ['#' + label + '-' + tag.id]
          $scope.comment.text = '#' + label + '-' + tag.id;
        }
      } else {
        $scope.comment.text = "something";
      }
      $log.info('ResourceCtrl -> startCommenting()');
      
      socket.emit('start:commenting', item.props, function (result) {
        
      });
    };
    
    $scope.postComment = function () {
      $log.debug('resource.postMention', $scope.commented);
      if($scope.comment.text.trim().length > 0 && $scope.commenting) {
        $scope.commenting = false;
        ResourceCommentsFactory.save({id: $scope.commented.id}, {
          content: $scope.comment.text,
          tags:  $scope.comment.tags
        }, function(res){
          
          console.log('postMention', res);
        })
      }
    };
    
    $scope.stopCommenting = function(item, tag, label){
        $scope.commenting = false;
        $scope.comment.tags = [];
        $scope.comment.text = ""
    };
    
    
    
    /*
    
      Following the trail
      -------------------
     */
    var Trail = function(path, start, index, level) {
      this.paths = [{
        path:  path,
        start: start
      }];
      this.index = index || 0;
      this.level = level || 0;
      this.start = start;
    };
    
    
    /*
    
      The messenger
      -------------
    */
    $scope.message = '';
    $scope.messaging = false;
    var _messengerTimer;
    $scope.setMessage = function(message, timeout, options) {
      if(!$scope.user.id) {
        return;
      }
      if(!message) {
        $scope.unsetMessage();
        return;
      }
      timeout = timeout || 5000;
      $scope.message = message;
      $scope.messaging = true;
      clearTimeout(_messengerTimer)
      _messengerTimer = setTimeout(function() {
        $scope.messaging = false;
        $scope.$apply();
      }, timeout)
    };
    
    $scope.unsetMessage = function(message) {
      if(message == $scope.message || !message) {
        clearTimeout(_messengerTimer);
        _messengerTimer = setTimeout(function() {
          $scope.messaging = false;
          $scope.$apply();
        }, 1000);
      }
    }
    
    /*
      Use it when it's busy in doing something
    */
    $scope.loadingQueue = {};

    $scope.lock = function(key) {
      $log.log('CoreCtrl -> lock() - key:', key?key:'no key provided');
      
      if(key)
        $scope.loadingQueue[key] = true;

      $scope.isLoading=true;
    }
  
    $scope.unlock = function(key) {
      
      if(key)
        $scope.loadingQueue[key] = false;

      var pending = _.compact(_.values($scope.loadingQueue)).length > 0;
      $log.log('CoreCtrl -> unlock() - key:', key?key:'no key provided', '- pending:', $scope.loadingQueue);
      
      if(!pending)
        $scope.isLoading=false;
    }

    $scope.forceUnlock = function(){
      $log.log('CoreCtrl -> forceUnlock()');
      $scope.loadingQueue = {};
    };
    /*
    
      Events listeners
      ----
    
    */
    var _resizeTimer;
    $rootScope.$on('$stateChangeStart', function (e, state) {
      // if(state.resolve) {
      $scope.forceUnlock();
      // }
      $scope.lock('$dom'); 
      // empty
      if(!_.isEmpty($scope.relatedItems))
        $scope.relatedItems = [];
      if(!_.isEmpty($scope.timeline))
        $scope.timeline = [];
    })

    $rootScope.$on('$stateChangeSuccess', function (e, state) {
      $log.log('CoreCtrl @stateChangeSuccess', state.name);
      // the ui.router state (cfr app.js)
      $scope.currentState = state;

      // if(state.resolve)
        // $scope.unlock();

      $scope.unsetMessage();
      
      // if any graph is availabe, tell sigma that you're
      // going to send the nodes
      $scope.$broadcast(EVENTS.STATE_CHANGE_SUCCESS, state.name);


      // $scope.setMessage(MESSAGES.LOADED, 1500);
      
      // set initial params here
      $scope.params = cleanService.params($location.search())
      
      // resize window
      clearTimeout(_resizeTimer);
      _resizeTimer = setTimeout(function() {
        $(window).trigger('resize');
      }, 300)
      
    });
    
    // fire event when DOM is ready
    $scope.$on('$viewContentLoaded', function(event){
      // $rootScope.$emit
      $scope.unlock('$dom');
      $rootScope.$emit(EVENTS.STATE_VIEW_CONTENT_LOADED, $scope.currentState);
    });
    
    
    $scope.$on(EVENTS.USER_NOT_AUTHENTIFIED, function (e) {
      if($scope.user.id) {
        // inform the user that it has to authentify ag
        $scope.setMessage("authentification troubles");
      } else
        $scope.unsetMessage(MESSAGES.LOADING);
    });
    
    
    
    /*
      listener $location
      ---
       handle reoute update, e.g on search
    */
    $scope.$on('$locationChangeStart', function (e, path) {
      $log.log('CoreCtrl @locationChangeStart');
      
      $scope.$broadcast(EVENTS.LOCATION_CHANGE_START)
      $scope.setMessage(MESSAGES.LOADING);
    });
    
    $scope.currentPath;
    
    $scope.$on('$locationChangeSuccess', function (e, path) {
      $log.log('CoreCtrl @locationChangeSuccess', path, $location);
      
      // same state as before???
      if($scope.currentPath == $location.path()) {
        $scope.params = $location.search();
        $scope.$broadcast(EVENTS.API_PARAMS_CHANGED, angular.copy($scope.params));
      
      }
      $scope.currentPath = $location.path();
      
      $scope.unsetMessage();
    });

    /*
      listener socket disconnection
      ---
    */
    socket.on('disconnect', function(){
      // debugger
      
      // location.reload(true);
    })
    
     /*
    
      Playlist
      --------
     */
     /*
      items - array of item ids to be loaded and added to queue
     */
     
     $scope.addToQueue = function (items) {
        var toBeAdded = [];
        toBeAdded = items.filter(function (d) {
          return $scope.playlistIds.indexOf(+d) == -1;
        });
        
        $log.log('CoreCtrl -> addToQueue() - n. items:', items.length,'- n. to be added:', toBeAdded.length)
        if(toBeAdded.length) {

          SuggestFactory.getUnknownNodes({
            ids: toBeAdded
          }, function (res) {
            $log.log('CoreCtrl -> addToQueue() SuggestFactory', res);
            $scope.playlist = $scope.playlist.concat(res.result.items);
            $scope.playlistIds = _.map( $scope.playlist, 'id');
            $scope.setMessage('toast.pinboard.added');
            // $scope.queueStatus = 'active'; @todo: simply blink the 
            $scope.queueRedirect();
          });
        }
     }

     $scope.queue = function(item, inprog) {
      // load item by id ...
      
      var itemId = typeof item == 'object'? item.id: item,
          indexOfItemId = $scope.playlistIds.indexOf(+itemId),
          isAlreadyInQueue = indexOfItemId != -1;
           // if the itemId is in the $scope.playlistIds, which is its index?
          // this will contain the list of ids in case the controller needs redirection
          
      $log.info('CoreCtrl -> queue', itemId, inprog? 'do not force update scope': 'force scope update', $scope.playlistIds,itemId )
      $log.log('   ', itemId, isAlreadyInQueue?'is already presend in readlist, skipping ...': 'adding', $scope.playlistIds.indexOf(itemId))
      
      if(isAlreadyInQueue) {
        $scope.setMessage('toast.pinboard.alreadyinlist');
        // $scope.queueStatus = 'active';
        if(!inprog)
          $scope.$apply();
        return;
      }
      
      
      
      // otherwise add item to queue...
      if(typeof item == 'object') {
        $scope.playlist.push(item);
        $scope.playlistIds.push(item.id);
        $scope.setMessage('toast.pinboard.added');
        
        // $scope.queueStatus = 'active';
        if(!inprog)
          $scope.$apply();
        $scope.queueRedirect();
      } else { // we need to load the item first, then we can update queue status
        SuggestFactory.getUnknownNodes({
          ids: [itemId]
        }, function (res) {
          $scope.setMessage('toast.pinboard.added');
          $scope.playlist.push(res.result.items[0]);
          $scope.playlistIds.push(res.result.items[0].id);
          // $scope.queueStatus = 'active';
          if(!inprog)
            $scope.$apply();
          // collect the ids in order to get the right redirect location
          $scope.queueRedirect();
        })
      }
    };
    
    $scope.getPlaylistFromLocalStorage = function () {
      var storedItems = localStorageService.get('playlist');
      if(!storedItems) {
        localStorageService.set('playlist', []);
        storedItems = localStorageService.get('playlist');
      }
      console.log('CoreCtrl -> getPlaylistFromLocalStorage() - n.items:', storedItems.length)
      if(storedItems.length) {
        $scope.playlist    = storedItems;
        $scope.playlistIds = _.map(storedItems, 'id');
        // $scope.queueStatus = 'active';
      }
    }
    
    $scope.getPlaylistFromLocalStorage();
    
    $scope.queueRedirect = function() {
      $log.log('CoreCtrl -> queueRedirect()', $state.current); 
      // store in the localstorage just the id
      localStorageService.set('playlist', angular.copy($scope.playlist));
      
      // if there isn't any item, just skip...
      if($scope.playlist.length == 0) {
        $scope.queueStatus = '';
        return;
      }
      
      // Otherwise check the current state
      
      if($scope.currentState.name == 'neighbors.resources') {
        $log.log('    redirect to: /#/neighbors/'+$scope.playlistIds.join(',')); 
        $location.path('/neighbors/'+$scope.playlistIds.join(','));
      }
    };
    
    $scope.hideQueue = function(item) {
      $scope.queueStatus = 'sleep';
    }
    /*
      playlist syncQueue
      check that the playlist is filled with the given ids.
      Otherwise take care of sync.
      @param ids  - array of integer node ids
    */
    $scope.syncQueue = function(ids) {
      if(ids.length != $scope.playlist.length) {
        SuggestFactory.getUnknownNodes({
          ids: ids
        }, function (res) {
          $scope.playlist = res.result.items;
          
          $scope.playlistIds = res.result.items.map(function (d) {
            return d.id;
          });
          
          $scope.queueStatus = 'active';
        });
      };
    };
     
    $scope.toggleQueue = function(item) {
      if($scope.queueStatus != 'active')
        $scope.queueStatus = 'active';
      else
        $scope.queueStatus = 'sleep';
    }

    $scope.closeQueue = function() {
      $scope.queueStatus = 'sleep';
    }
    
    // remove from playlist, then redirect.
    $scope.removeFromQueue = function(item) {
      $log.log('CoreCtrl -> removeFromQueue()', item.id);
      var indexToRemove = -1,
          ids = [];
      
      for(var i = 0; i < $scope.playlist.length; i++) {
        if($scope.playlist[i].id == item.id) {
          indexToRemove = i;
        } else { // only for redirection purposes
          ids.push($scope.playlist[i].id);
        }
      }
      if(indexToRemove !== -1)
        $scope.playlist.splice(indexToRemove, 1);
      
      $scope.playlistIds = ids;
      $scope.queueRedirect();
    };

    /*
      Raise a new Issue
      for an entity in a specific context.
    */
    $rootScope.raiseIssue = function(entity, resource, kind, solution, next){
      var params = {
        kind: kind,
      }
      if(resource)
        params.mentioning = resource.id;

      if(solution)
        params.solution = !isNaN(solution)? parseInt(solution): solution;

      $log.log('CoreCtrl -> raiseIssue() on entity:', entity.id, '- mentioning:', resource);
      

      EntityRelatedFactory.save({
        id: entity.id,
        model: 'issue'
      }, params, function (res) {
        $log.log('CoreCtrl -> raiseIssue()', res.status);
        if(next)
          next(null, res);
      });
    };

    $rootScope.downvoteIssue = function(entity, resource, kind, solution, next){
      var params = {
        kind: kind,
      }
      if(resource)
        params.mentioning = resource.id;

      if(solution)
        params.solution = !isNaN(solution)? parseInt(solution): solution;

      $log.log('CoreCtrl -> downvoteIssue() kind: ' + kind+'- on entity:', entity.id, '- mentioning:', resource);
      

      EntityRelatedFactory.delete(_.assign({
        id: entity.id,
        model: 'issue'
      }, params), function (res) {
        $log.log('CoreCtrl -> downvoteIssue()', res.status);
        if(next)
          next(null, res);
      });
    }

    /*
      $scope.confirm
      Confirm the entity without confiming the relationship between the entity and the resource
    */
    $scope.confirm = function(entity, next) {
      $log.log('CoreCtrl -> confirm() entity:', entity.id);
      EntityExtraFactory.save({
        id: entity.id,
        extra: 'upvote'
      }, {}, function (res) {
        $log.log('CoreCtrl -> confirm()', res.status);
        if(next)
          next(res.result);
      });
    };

    /*
      $scope.confirm
      Unconfirm the entity without unconfiming the relationship between the entity and the resource
    */
    $scope.unconfirm = function(entity, next) {
      $log.log('CoreCtrl -> unconfirm() entity:', entity.id);
      EntityExtraFactory.save({
        id: entity.id,
        extra: 'downvote'
      }, {}, function (res) {
        $log.log('CoreCtrl -> unconfirm()', res.status);
        if(next)
          next(res.result);
      });
    };

    /*
      Voting mechanism: upvote the relationships between an entity and a resource
      (their id and the type will suffice)
    
    */
    $rootScope.upvote = function(entity, resource, next) {
      $log.log('CoreCtrl -> upvote() entity:', entity.id, '- resource:', resource.id);
      
      EntityRelatedExtraFactory.save({
        id: entity.id,
        model: 'resource',
        related_id: resource.id,
        extra: 'upvote'
      }, {}, function (res) {
        $log.log('CoreCtrl -> upvote()', res.status);
        if(next)
          next(res.result);
      });
    }
    /*
      Voting mechanism: downvote(), on relationships entity resource
      (the id and the type will suffice)

    */
    $rootScope.downvote = function(entity, resource, next) {
      $log.log('CoreCtrl -> downvote() entity:', entity.id, '- resource:', resource.id);
      
      EntityRelatedExtraFactory.save({
        id: entity.id,
        model: 'resource',
        related_id: resource.id,
        extra: 'downvote'
      }, {}, function (res) {
        $log.log('CoreCtrl -> downvote()', res.status);
        if(next)
          next(res.result);
      });
    };
    
    /*
      Voting mechanism: discard(), delete relationships entity resource
      (only if the user is the creator of the relationship and there are no other upvotes)

    */
    $rootScope.discardvote = function(entity, resource, next) {
      $log.log('CoreCtrl -> discardvote() entity:', entity.id, '- resource:', resource.id);
      
      EntityRelatedExtraFactory.delete({
        id: entity.id,
        model: 'resource',
        related_id: resource.id,
        extra: ''
      }, {}, function (res) {
        $log.log('CoreCtrl -> discardvote()', res.status);
        if(next)
          next(res.result);
      });
    };


    /*
      Favourite the current resource ♥
    */
    $scope.favourite = function(resource, next) {
      ResourceRelatedFactory.save({
        id: resource.id,
        model: 'user',  
      }, {}, function (res) {
        console.log('CoreCtrl -> favourite() - result:', res.status);
        if(next)
          next(res.result);
      });
    };
    
    /*
      Unfavourite the current resource (#@# --> ♥)
    */
    $scope.unfavourite = function(resource, next) {
      ResourceRelatedFactory.delete({
        id: resource.id,
        model: 'user',  
      }, {}, function (res) {
        console.log('CoreCtrl -> unfavourite() - result:', res.status);
        if(next)
          next(res.result);
      });
    };


    /*
      Merge two entities together in a specific resource

    */
    $rootScope.mergeEntities = function(wrong, trusted, resource, next) {
      EntityRelatedExtraFactory.save({
        id: wrong.id,
        model: 'resource',
        related_id: resource.id,
        extra: 'merge'
      }, {
        with: trusted.id
      }, function (res) {
        $log.log('CoreCtrl -> mergeEntities()', res.status);
        if(next)
          next(res.result);
      });
    };

    /*
      Voting mechanism on ENTITY itself: it is a mlispelling or an error.
    */
    $scope.signale = function(entity, next) {
      EntityExtraFactory.save({
        id: entity.id,
        model: 'resource',
        extra: 'downvote'
      }, {}, function (res) {
        $log.log('CoreCtrl -> signale()', res.status);
        // feedback
        if(res.status == 'ok')
          $scope.setMessage('thanks for your feedback')
        if(next)
          next();
      });
    }

    /*
      Inpect
      ---
      Open the inspector issue modal
      and load the desired items.
      

    */
    $rootScope.inspect = function(entity, resource, issue) {
      $log.log('CoreCtrl -> inspect() - entity:', entity, (resource? '- resource: ' + resource.id: ''));
      var language = $scope.language;

      var modalInstance = $uibModal.open({
        animation: true,
        templateUrl: 'templates/modals/inspect.html',
        controller: 'InspectModalCtrl',
        windowClass: "modal fade in inspect",
        resolve: {
          entity: function(EntityFactory) {
            return EntityFactory.get({id: entity.id}).$promise
          },
          issue: function(){
            return issue
          },
          user: function(){
            return $scope.user;
          },
          relatedModel: function() {
            return 'resource'
          },
          relatedFactory: function(EntityRelatedFactory) {
            return EntityRelatedFactory
          },
          language: function() {
            return language
          },
          core: function() {
            return $scope;
          }
        }
        // resolve: {
        //   items: function () {
        //     return $scope.items;
        //   }
        // }
      });
    };


    /*
      MetadataInspect
      ---
      Open the inspector for document metadata ...
      Require the item.id and the item.type properties

      @param item   - object having a item id
      @param type     - type of metadata
    */
    $scope.inspectMetadata = function(item, type, options) {
      $log.debug('CoreCtrl -> inspectMetadata() - item:', item);

      var language      = $scope.language;
      var modalInstance = $uibModal.open({
        animation: true,
        templateUrl: 'templates/modals/inspect-metadata.html',
        controller: 'InspectMetadataModelCtrl',
        windowClass: "modal fade in inspect-metadata",
        size: 'sm',
        resolve: {
          options: function() {
            return options || {}
          },
          type: function(){
            return type
          },
          item: function() {
            return item
          },
          language: function() {
            return language
          }
        }
      });
    };

    /*
      Contribute
      ---
      Open the contribute modal for the given item
      It allows users to suggest entities.
      usage (from everywhere)
      $scope.contribute({id: 25723, type: 'resource'})
    */
    $scope.contribute = function(item, type, options) {
      $log.debug('CoreCtrl -> contribute() - item:', item);

      var language      = $scope.language,
          options       =  options || {};

      options.createEntity = $scope.createEntity;

      var modalInstance = $uibModal.open({
        animation: true,
        templateUrl: 'templates/modals/contribute.html',
        controller: 'ContributeModalCtrl',
        windowClass: "modal fade in contribute",
        size: 'sm',
        resolve: {
          options: function() {
            return options
          },
          type: function(){
            return type
          },
          resource: function() {
            return item
          },
          language: function() {
            return language
          }
        }
        // resolve: {
        //   items: function () {
        //     return $scope.items;
        //   }
        // }
      });

      modalInstance.result.then(function (result) {
        if(options && typeof options.discard == "function") {
          options.submit(options.annotator, result);
        }
      }, function(){
        if(options && typeof options.discard == "function") {
          options.discard(options.annotator);
        }
      });

    };

    /*
      Create New
      ---
      Open the create new modal for the given item
      It allows users to suggest entities.
      usage (from everywhere, or to test)
      $scope.contribute({id: 25723, type: 'resource'}, 'person')
    */
    $scope.createEntity = function(item, type, options) {
      $log.debug('CoreCtrl -> createEntity() - item:', item, type, options);
      if(type != 'person') {
        return;
      }
      var language      = $scope.language;
      var modalInstance = $uibModal.open({
        animation: true,
        templateUrl: 'templates/modals/create-entity.html',
        controller: 'CreateEntityModalCtrl',
        windowClass: "modal fade in contribute",
        backdrop : 'static',
        size: 'sm',
        resolve: {
          options: function() {
            return options || {}
          },
          type: function(){
            return type
          },
          resource: function() {
            return item
          },
          language: function() {
            return language
          }
        }
      })
    }
    // $scope.createEntity({id: 13113, type: 'resource'}, 'person', { query: 'Cumming'})

    
    // $scope.contribute({id: 25723})
    // $scope.inspect([26414])//27329]);
    /*
      Open an issue modal
    */
    $scope.openIssueModal = function (type, target) {
      $scope.freeze = 'sigma';
      $log.log('CoreCtrl -> openIssueModal - type:', type, 'target_id', target.id)
      

      var modalInstance = $modal.open({
        animation: false,
        templateUrl: 'templates/partials/comment-modal.html',
        controller: 'IssueModalCtrl',
        size: 'sm',
        resolve: {
          user: function(){
            return $scope.user;
          },
          type: function(){
            return type
          },
          target: function(){
            return target;
          },
          
          items: function() {
            return ResourceRelatedFactory.get({
              id: target.id,
              model:'issue'
            }).$promise
          }
        }
      });
    };
    
    $scope.cancel = function () {
      $modalInstance.dismiss('close');
    };
    
    $scope.isAnnotating = false;
    
    $scope.$on(EVENTS.ANNOTATOR_SHOWN, function() {
      $log.info('CoreCtrl @EVENTS.ANNOTATOR_SHOWN')
      
    })
    
    $scope.$on(EVENTS.ANNOTATOR_HIDDEN, function() {
      $scope.isAnnotating = false;
    })

    $scope.lock('auth');
    UserFactory
      .get({ method: 'session' }).$promise
      .then(function(response) {
        $scope.user = _.get(response, 'result.item', {});
        $log.info('Auth successful', $scope.user)
        $scope.unlock('auth');
      })
      .catch(function(error) {
        $log.error('Could not fetch user details because: ' + error.message);
        $scope.user = { is_authenticated: false };
        $scope.forceUnlock();
        $scope.isLoading=false;
      });

    /*
      Load timeline, after some ms
    */
    $timeout(function(){
        /*
          First load only,
          or to be updated whenever a
          CHANGES in resource set occurs
        */
        

        VisualizationFactory.resource(VIZ.TIMELINE).then(function (res) {
          $log.info('CoreCtrl @EVENTS.USE_USER VisualizationFactory', res);
          $scope.contextualTimeline = res.data.result.timeline;
          // $scope.initialTimeline
        });


      // $scope.inspect({id: 17190});

    }, 236);
    
  })
  

  
  /*
    This controller handle the modal bootstrap that allow users to propose a new content for something.
  */
  .controller('IssueModalCtrl', function ($scope, $modalInstance, $log, user, type, target, items, ResourceRelatedFactory) {
    $log.log('IssueModalCtrl ready', type, items.result.items)
    $scope.type = type;
    $scope.target = target;
    $scope.user = user;
    $scope.items = items.result.items; // :D
    
    $scope.ok = function () {
      if(type == 'date')
        ResourceRelatedFactory.save({
          model: 'issue',
          id: target.id
        }, {
          type: 'date',
          solution: [$scope.start_date, $scope.end_date],
          description: $scope.description || ''
        }, function(res) {
          console.log(res)
          //$modalInstance.close();
        });
    };

   
  })
  /*
    This controller handle the modal bootstrap that allow users to propose a new content for something.
    Base controller for metadata issues.
  */
  .controller('InspectMetadataModelCtrl', function ($scope, $log, $uibModalInstance, type, item, options, language) {
    $log.log('InspectMetadataModelCtrl ready', type, item)
    
    $scope.type = type;
    $scope.item = item;
    $scope.language = language;

    $scope.date = {
      from: $scope.item.start_date? (new Date()):null,
      to: $scope.item.end_date? (new Date()):null,
    }
    // $scope.ok = function () {
    //   if(type == 'date')
    //     ResourceRelatedFactory.save({
    //       model: 'issue',
    //       id: target.id
    //     }, {
    //       type: 'date',
    //       solution: [$scope.start_date, $scope.end_date],
    //       description: $scope.description || ''
    //     }, function(res) {
    //       console.log(res)
    //       //$modalInstance.close();
    //     });
    // };

    $scope.ok = function () {
      $uibModalInstance.close();
    };

    $scope.cancel = function () {
      $uibModalInstance.dismiss('cancel');
    };
   
  })
  /*
    A generic controller for every relatedItem
  */
  .controller('RelatedItemsCtrl', function ($scope, $log, $stateParams, $filter, specials, relatedItems, relatedModel, relatedVizFactory, relatedFactory, socket, EVENTS) {
    
    $scope.totalItems  = relatedItems.info.total_items;
    $scope.limit       = relatedItems.info.limit;
    $scope.offset      = relatedItems.info.offset;
    // $scope.page        = 1; // always first page!!
    
    /*
      set order by
      according to the favourite orderby. Avoid default values.
    */
    if(relatedItems.info.orderby != 'relevance')
      $scope.setSorting(relatedItems.info.orderby);
    
    /*
      set facets
    */
    $scope.setFacets('type', relatedItems.info.groups);
    
    $log.debug('RelatedItemsCtrl ready');
    /*
      Load graph data
    */
    $scope.syncGraph = function() {
      $scope.lock('graph');
      relatedVizFactory.get(angular.extend({
        model: relatedModel,
        viz: 'graph',
        limit: 100,
      },  $stateParams, $scope.params), function (res) {
        $scope.unlock('graph');
        if($stateParams.ids) {
          $scope.setGraph(res.result.graph, {
            centers: $stateParams.ids
          });
        } else if($scope.item && $scope.item.id)
          $scope.setGraph(res.result.graph, {
            centers: [$scope.item.id]
          });
        else
          $scope.setGraph(res.result.graph);
      });
    }

      
    /*
      Reload related items, with filters.
    */
    $scope.sync = function() {
      $scope.lock('RelatedItemsCtrl');

      relatedFactory.get(angular.extend({
        model: relatedModel,
        limit: $scope.limit,
        offset: $scope.offset
      }, $stateParams, $scope.params), function (res) {
        $scope.unlock('RelatedItemsCtrl');
        $scope.offset  = res.info.offset;
        $scope.limit   = res.info.limit;
        $scope.totalItems = res.info.total_items;
        if($scope.offset > 0)
          $scope.addRelatedItems(res.result.items);
        else
          $scope.setRelatedItems(res.result.items);
        // reset if needed
        $scope.setFacets('type', res.info.groups);
      }) 
    };

    /*
      listener: EVENTS.API_PARAMS_CHANGED
      some query parameter has changed, reload the list accordingly.
    */
    $scope.$on(EVENTS.API_PARAMS_CHANGED, function() {
      // reset offset
      $scope.offset = 0;
      $log.debug('RelatedItemsCtrl @API_PARAMS_CHANGED', $scope.params);
      $scope.sync();
      if($stateParams.ids || $stateParams.query || ~~!specials.indexOf('syncGraph'))
        $scope.syncGraph();
    });
    
    
    $scope.$on(EVENTS.INFINITE_SCROLL, function (e) {
      $scope.offset = $scope.offset + $scope.limit;
      $log.debug('RelatedItemsCtrl @INFINITE_SCROLL', '- skip:',$scope.offset,'- limit:', $scope.limit);
      
      $scope.sync();
    });
    
    function onSocket(result) {
      console.log('RelatedItemsCtrl @socket', result)
      for(var i=0, l=$scope.relatedItems.length; i < l; i++){
        if($scope.relatedItems[i].id == result.resource.id) {
          $scope.relatedItems[i] = result.data.related.resource
          break;
        }
      }
    };

    /*
      on socket events, 
    */
    socket.on('entity:upvote-related-resource:done', onSocket);
    socket.on('entity:downvote-related-resource:done', onSocket);
    socket.on('entity:merge-entity:done', onSocket);
    socket.on('entity:upvote-related-resource:done', onSocket);
    
    // $scope.syncGraph();
    $log.log('RelatedItemsCtrl -> setRelatedItems - items', relatedItems.result.items);
    $scope.setRelatedItems(relatedItems.result.items);
    
    if($stateParams.ids || $stateParams.query || ~~!specials.indexOf('syncGraph'))
      $scope.syncGraph();
  });