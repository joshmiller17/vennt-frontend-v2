<template>
  <div class="card column padded">
    <div class="alignRow gap">
      <label for="settings-attr" class="labelText nowrap"
        >Edit attribute value:</label
      >
      <select v-model="state.attr" id="settings-attr" class="input">
        <option v-for="attr in validAttributes" :key="attr" :value="attr">
          {{ attrFullName(attr) }}
        </option>
      </select>
    </div>
    <AttributeHelp :attr="state.attr" class="textBlock mt-8"></AttributeHelp>
    <div class="separator thin"></div>
    <AdjustAttributeLink :attr="state.attr" class="mt-8"></AdjustAttributeLink>
  </div>
</template>

<script setup lang="ts">
import { type EntityAttribute, validAttributes } from "@/utils/backendTypes";
import { reactive } from "vue";
import { attrFullName } from "@/utils/attributeUtils";
import AttributeHelp from "../../Attributes/AttributeHelp.vue";
import AdjustAttributeLink from "../../Attributes/AdjustAttributeLink.vue";

interface attributesState {
  attr: EntityAttribute;
}
const state = reactive<attributesState>({ attr: "agi" });
</script>
