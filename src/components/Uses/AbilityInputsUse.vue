<template>
  <div v-for="input in inputs" :key="input.key">
    <AbilityInputsRadioUse
      v-if="input.type === 'radio'"
      :ability="ability"
      :input="input"
    ></AbilityInputsRadioUse>
    <AbilityInputsTextUse
      v-else-if="input.type === 'text'"
      :ability="ability"
      :input="input"
    ></AbilityInputsTextUse>
  </div>
</template>

<script setup lang="ts">
import AbilityInputsRadioUse from "./AbilityInputsRadioUse.vue";
import AbilityInputsTextUse from "./AbilityInputsTextUse.vue";
import type { FullEntityAbility, UseInputs } from "@/utils/backendTypes";

defineProps<{ ability: FullEntityAbility; inputs?: UseInputs }>();
</script>
