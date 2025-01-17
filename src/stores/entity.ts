import {
  addAbilitiesApi,
  addCollectedEntityApi,
  addEntityTextApi,
  addFluxApi,
  addItemsApi,
  deleteFluxApi,
  fetchCollectedEntityApi,
  updateEntityAttributesApi,
  updateEntityTextApi,
  updateFluxApi,
  deleteEntityApi,
  updateEntityApi,
  updateEntityTextPermissionApi,
} from "@/api/apiEntity";
import router, {
  ENTITY_ABILITIES_ROUTE,
  ENTITY_ITEMS_ROUTE,
  HOME_ROUTE,
} from "@/router";
import type {
  ConsolidatedItem,
  EntityTextKey,
  FullCollectedEntity,
  PartialEntity,
  PartialEntityAbility,
  PartialEntityFlux,
  PartialEntityItem,
  UncompleteCollectedEntityWithChangelog,
  UncompleteEntityAbility,
  UncompleteEntityFlux,
  UncompleteEntityItem,
  UpdateEntityAttributes,
} from "@/utils/backendTypes";
import { sortAbilities } from "@/utils/abilityUtils";
import { consolidateItemList } from "@/utils/itemUtils";
import { entityAttributesMap } from "@/utils/attributeUtils";
import { defineStore } from "pinia";
import { useCharacterCreateStore } from "./characterCreate";
import { deleteItemApi, updateItemApi } from "@/api/apiItems";
import { deleteAbilityApi, updateAbilityApi } from "@/api/apiAbilities";
import { useAccountInfoStore } from "./accountInfo";
import {
  defaultEntityTextPermission,
  getEntityText,
} from "@/utils/entityUtils";
import { useEntityNotesStore } from "./entityNotes";
import { useCogCreateStore } from "./cogCreate";

const setInitialNotes = (entity: FullCollectedEntity) => {
  const foundNotes = getEntityText("NOTES", entity);
  if (foundNotes) {
    useEntityNotesStore().setInitialNotes(foundNotes);
  }
};

type EntityState = {
  entity: undefined | FullCollectedEntity;
  levelsToProcess: number;
  apisInFlight: Record<string, boolean>;
};

type AddCollectedEntityOptions = {
  redirectName: string;
  clearCharacterCreation: boolean;
  clearCogCreation: boolean;
};

export const useEntityStore = defineStore("entity", {
  state: (): EntityState => {
    return {
      entity: undefined,
      levelsToProcess: 0,
      apisInFlight: {},
    };
  },
  getters: {
    consolidatedItems: (state) =>
      state.entity ? consolidateItemList(state.entity.items) : [],
    entityAttributes: (state) =>
      state.entity ? entityAttributesMap(state.entity) : {},
    sortedAbilities: (state) =>
      state.entity ? sortAbilities(state.entity.abilities) : [],
    abilityNames: (state) =>
      state.entity ? state.entity.abilities.map((ability) => ability.name) : [],
    canEdit: (state) => {
      const accountInfoStore = useAccountInfoStore();
      return (
        state.entity &&
        accountInfoStore.accountInfo &&
        state.entity.entity.owner === accountInfoStore.accountInfo.id
      );
    },
    backstory: (state) => getEntityText("BACKSTORY", state.entity),
    description: (state) => getEntityText("DESC", state.entity),
  },
  actions: {
    clearLocalEntity() {
      this.entity = undefined;
      this.levelsToProcess = 0;
      this.apisInFlight = {};
    },
    async addCollectedEntity(
      request: UncompleteCollectedEntityWithChangelog,
      options?: Partial<AddCollectedEntityOptions>
    ) {
      this.entity = await addCollectedEntityApi(request);
      if (options?.redirectName) {
        router.push({
          name: options.redirectName,
          params: { id: this.entity.entity.id },
        });
      }
      if (options?.clearCharacterCreation) {
        useCharacterCreateStore().clearCharacter();
      }
      if (options?.clearCogCreation) {
        useCogCreateStore().clearCog();
      }
      setInitialNotes(this.entity);
    },
    async fetchCollectedEntity(id: string) {
      this.entity = await fetchCollectedEntityApi(id);
      setInitialNotes(this.entity);
    },
    async updateEntity(request: PartialEntity) {
      if (this.entity) {
        this.entity.entity = await updateEntityApi(
          this.entity.entity.id,
          request
        );
      }
    },
    async deleteEntity() {
      if (this.entity) {
        deleteEntityApi(this.entity.entity.id);
        this.clearLocalEntity();
        router.push({ name: HOME_ROUTE });
      }
    },
    async updateEntityAttributes(id: string, request: UpdateEntityAttributes) {
      // TODO: may want to pre-apply the change
      const updatedBaseEntity = await updateEntityAttributesApi(id, request);
      if (this.entity) {
        this.entity = { ...this.entity, entity: updatedBaseEntity };
      }
    },
    async addAbilities(
      abilities: UncompleteEntityAbility[],
      redirectToAbilities?: boolean
    ) {
      if (!this.entity || abilities.length <= 0) return;
      const newAbilities = await addAbilitiesApi(
        this.entity.entity.id,
        abilities
      );
      this.entity.abilities.push(...newAbilities);
      if (redirectToAbilities && newAbilities.length > 0) {
        const query = { ...router.currentRoute.value.query };
        if (query.new === "ability") {
          delete query.new;
        }
        router.push({
          name: ENTITY_ABILITIES_ROUTE,
          params: {
            ...router.currentRoute.value.params,
            detail: newAbilities[0].id,
          },
          query,
        });
      }
    },
    async updateAbility(abilityId: string, ability: PartialEntityAbility) {
      if (this.entity) {
        const currentAbilityIdx = this.entity.abilities.findIndex(
          (search) => search.id === abilityId
        );
        if (currentAbilityIdx >= 0) {
          this.entity.abilities[currentAbilityIdx] = await updateAbilityApi(
            abilityId,
            ability
          );
        }
      }
    },
    deleteAbility(abilityId: string, closeSidebar?: boolean) {
      if (
        closeSidebar &&
        this.entity &&
        router.currentRoute.value.params.detail === abilityId
      ) {
        const routeParams = { ...router.currentRoute.value.params };
        delete routeParams.detail;
        router.push({
          name: router.currentRoute.value.name ?? ENTITY_ABILITIES_ROUTE,
          params: routeParams,
          query: router.currentRoute.value.query,
        });
      }
      if (this.entity) {
        this.entity.abilities = this.entity.abilities.filter(
          (ability) => ability.id !== abilityId
        );
      }
      deleteAbilityApi(abilityId);
    },
    async addItems(
      items: UncompleteEntityItem[],
      redirectToInventory?: boolean
    ) {
      if (!this.entity || items.length <= 0) return;
      const newItems = await addItemsApi(this.entity.entity.id, items);
      this.entity.items.push(...newItems);
      if (redirectToInventory && newItems.length > 0) {
        const query = { ...router.currentRoute.value.query };
        if (query.new === "item") {
          delete query.new;
        }
        router.push({
          name: ENTITY_ITEMS_ROUTE,
          params: {
            ...router.currentRoute.value.params,
            detail: newItems[0].id,
          },
          query,
        });
      }
    },
    async updateItem(itemId: string, item: PartialEntityItem) {
      if (!this.entity) return;
      const currentItemIdx = this.entity.items.findIndex(
        (search) => search.id === itemId
      );
      if (currentItemIdx >= 0) {
        this.entity.items[currentItemIdx] = await updateItemApi(itemId, item);
      }
    },
    deleteItem(item: ConsolidatedItem, closeSidebar?: boolean) {
      if (!this.entity) return;
      const itemId = item.ids[item.ids.length - 1];
      if (closeSidebar && router.currentRoute.value.params.detail === itemId) {
        const routeParams = { ...router.currentRoute.value.params };
        delete routeParams.detail;
        router.push({
          name: router.currentRoute.value.name ?? ENTITY_ITEMS_ROUTE,
          params: routeParams,
          query: router.currentRoute.value.query,
        });
      }
      this.entity.items = this.entity.items.filter(
        (item) => item.id !== itemId
      );
      deleteItemApi(itemId);
    },
    async saveText(key: EntityTextKey, text: string) {
      if (!this.entity) return;
      const foundIdx = this.entity.text.findIndex(
        (search) => search.key === key
      );
      if (foundIdx < 0) {
        this.apisInFlight[key] = true;
        this.entity.text.push(
          await addEntityTextApi(this.entity.entity.id, {
            key,
            text,
            public: defaultEntityTextPermission(key),
          })
        );
        this.apisInFlight[key] = false;
      } else {
        if (this.entity.text[foundIdx].text !== text) {
          this.entity.text[foundIdx].text = text;
          this.apisInFlight[key] = true;
          await updateEntityTextApi(this.entity.entity.id, key, text);
          this.apisInFlight[key] = false;
        }
      }
    },
    async updateTextPermission(key: EntityTextKey, newPermission: boolean) {
      if (!this.entity) return;
      const foundIdx = this.entity.text.findIndex(
        (search) => search.key === key
      );
      if (this.entity.text[foundIdx].public !== newPermission) {
        this.entity.text[foundIdx].public = newPermission;
        await updateEntityTextPermissionApi(
          this.entity.entity.id,
          key,
          newPermission
        );
      }
    },
    async saveFlux(request: UncompleteEntityFlux) {
      if (!this.entity) return;
      const newFlux = await addFluxApi(this.entity.entity.id, request);
      this.entity.flux.push(newFlux);
    },
    updateFlux(fluxId: string, request: PartialEntityFlux) {
      if (!this.entity) return;
      const foundIdx = this.entity.flux.findIndex((flux) => flux.id === fluxId);
      if (foundIdx >= 0) {
        this.entity.flux[foundIdx] = {
          ...this.entity.flux[foundIdx],
          ...request,
        };
      }
      updateFluxApi(this.entity.entity.id, fluxId, request);
    },
    deleteFlux(fluxId: string) {
      if (!this.entity) return;
      this.entity.flux = this.entity.flux.filter((flux) => flux.id !== fluxId);
      deleteFluxApi(this.entity.entity.id, fluxId);
    },
  },
});
