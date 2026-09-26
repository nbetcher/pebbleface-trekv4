/* Adapted from pebble-effect-layer (MIT). See THIRD_PARTY_NOTICES.md. */
#include <pebble.h>
#include "effect_layer.h"
#include "effects.h"

// on layer update - apply effect
static void effect_layer_update_proc(Layer *me, GContext* ctx) {
  // Retrieve the layer and its screen coordinates using the public Layer API.
  EffectLayer* effect_layer = (EffectLayer*)(layer_get_data(me));
  GRect layer_frame = layer_get_bounds(me);
  layer_frame.origin = layer_convert_point_to_screen(me, layer_frame.origin);

  // Applying effects
  for(uint8_t i=0; i<MAX_EFFECTS && effect_layer->effects[i]; ++i) effect_layer->effects[i](ctx, layer_frame, effect_layer->params[i]);
}

// create effect layer
EffectLayer* effect_layer_create(GRect frame) {

  //creating base layer
  Layer* layer =layer_create_with_data(frame, sizeof(EffectLayer));
  if (!layer) { return NULL; }
  layer_set_update_proc(layer, effect_layer_update_proc);
  EffectLayer* effect_layer = (EffectLayer*)layer_get_data(layer);
  memset(effect_layer,0,sizeof(EffectLayer));
  effect_layer->layer = layer;

  return effect_layer;
}

//destroy effect layer
void effect_layer_destroy(EffectLayer *effect_layer) {
  // precaution
  if (effect_layer != NULL && effect_layer->layer != NULL) {
    Layer *layer = effect_layer->layer;
    effect_layer->layer = NULL;
    layer_destroy(layer);
  }

}

// returns base layer
Layer* effect_layer_get_layer(EffectLayer *effect_layer){
  return effect_layer ? effect_layer->layer : NULL;
}

//sets frame for effect layer
void effect_layer_set_frame(EffectLayer *effect_layer, GRect frame) {
  if (effect_layer && effect_layer->layer) { layer_set_frame(effect_layer->layer, frame); }
}

//adds effect to the layer
void effect_layer_add_effect(EffectLayer *effect_layer, effect_cb* effect, void* param) {
  if(effect_layer && effect && effect_layer->next_effect < MAX_EFFECTS) {
    effect_layer->effects[effect_layer->next_effect] = effect;
    effect_layer->params[effect_layer->next_effect] = param;
    ++effect_layer->next_effect;
  }
}

//removes last added effect
void effect_layer_remove_effect(EffectLayer *effect_layer) {
  if(effect_layer && effect_layer->next_effect > 0) {
    effect_layer->effects[effect_layer->next_effect - 1] = NULL;
    effect_layer->params[effect_layer->next_effect - 1] = NULL;
    --effect_layer->next_effect;
  }
}
