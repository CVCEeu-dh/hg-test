/**
 * Resource Model for documents, video etc...
 * ======================
 *
 */
var settings  = require('../settings'),
    helpers   = require('../helpers.js'),
    parser    = require('../parser.js'),
    neo4j     = require('seraph')(settings.neo4j.host),
    
    rQueries  = require('decypher')('./queries/resource.cyp'),
    vQueries  = require('decypher')('./queries/version.cyp'),
    
    async     = require('async'),
    YAML      = require('yamljs'),
    _         = require('lodash');


module.exports = {
  /**
    get a complete resource object (with versions, comments etc...).
    @param language - 'en' or 'fr' or other two chars language identifier 
   */
  get: function(id, language, next) {
    neo4j.query(rQueries.get_resource_by_language, {
      id: +id,
      language: language
    }, function(err, items) {
      if(err) {
        next(err);
        return
      }
      
      var item = items[0].resource;
      
      // yaml parsing
      item.positionings = _.map(_.values(item.positionings), function (d) {
        if(d.yaml)
          d.yaml = YAML.parse(d.yaml);
        return d;
      });
      
      // yaml parsing and annotation
      item.annotations = _.map(_.values(item.annotations), function (d) {
        if(d.yaml)
          d.yaml = YAML.parse(d.yaml);
        
        var content = [
          item.props['title_'+ language] || '',
          item.props['caption_'+ language] || ''
        ].join('§ ');
        console.log('eee', content, item)
        var annotations = parser.annotate(content, d.yaml).split('§ ');
        
        d.annotated = {
          title: annotations[0],
          source: annotations[1]
        };
        return d;
      });
      
      item.places = _.values(item.places);  
      item.locations = _.values(item.locations);
      item.persons = _.values(item.persons);
      item.comments = _.values(item.comments);
      item.collections = _.values(item.collections);

      next(null, item);
    });  
  },
  search: function(options, next) {
    // at least options.search should be given.
    // note that if there is a solr endpoint, this endpoint should be used.
    // you can retrieve later the actual resources by doi.
  },
  create: function(properties, next) {

  },
  update: function(id, properties, next) {

  },
  remove: function(id, next) {
    
  },
  /*
    The long chain of the discovery. Perform TEXTRAZOR on some field of our darling resource and GEOCODE/GEONAMES for the selected geolocations
  */
  discover: function(id, next) {
    // quetly does textrazor entity extraction.
    neo4j.read(id, function(err, res) {
      if(err) {
        next(err);
        return;
      }
      // should specify the different languages.
      if(res.languages && res.languages.length) {
        var q = async.queue(function (language, nextLanguage) {
          var content = [
            res['title_'+ language] || '',
            res['caption_'+ language] || ''
          ].join('. ');
          
          if(content.length < 10 || ['en', 'fr'].indexOf(language) === -1) { // not enough content
            nextLanguage();
            return;
          }
          
          // merge textrazor different version
          helpers.textrazor(content, function(err, entities) {
            if(err == helpers.IS_LIMIT_REACHED) {
              console.log('daily limit reached')
              // daily limit has been reached
              q.kill();
              next()
              return;
            }
            
            if(err)
              throw err;
            
            var yaml = [];
            // save the resource-entities relationship and prepare the annotation
            var _q = async.queue(function (entity, nextEntity) {
              yaml.push({
                id: entity.id, // local entity id, or uri?
                context: entity.context
              });
              helpers.enrichResource(res, entity, function(err, next) {
                if(err)
                  throw err;
                nextEntity();
              });
            }, 2);
            
            _q.push(entities);
            _q.drain = function() {
              var now = helpers.now(),
                  persons = entities.filter(function (d) {
                    return (!d.geocode_id && !d.geonames_id)
                  });
              // add the proper version according to the language
              neo4j.query(vQueries.merge_version_from_service, {
                resource_id: res.id,
                service: 'textrazor',
                unknowns: persons.length,
                persons: persons.length,
                creation_date: now.date,
                creation_time: now.time,
                language: language,
                yaml: YAML.stringify(yaml, 2)
              }, function (err, nodes) {
                console.log(err, vQueries.merge_version_from_service)
                if(err)
                  throw err;
                // merge the version and the res
                neo4j.query(vQueries.merge_relationship_version_resource, {
                  version_id: nodes[0].id,
                  resource_id: res.id
                }, function (err, nodes) {
                  if(err)
                    throw err;
                  console.log('  res #id',res.id,' saved, #ver_id', nodes[0].ver.id, 'res_url:', nodes[0].res.url);
                  // out
                  nextLanguage();
                });
              }); // eof vQueries.merge_version_from_service
            }; // eof drain async
          });
        },1);
        q.push(res.languages);
        q.drain = function() {
          next(null, res);
        }
      }
    });
    //helpers.
  }
}