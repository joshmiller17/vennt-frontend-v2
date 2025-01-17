import isEqual from "lodash.isequal";
import {
  abilityFieldsNameValidator,
  type AbilityCostMap,
  type AbilityCostMapNumber,
  type CharacterGift,
  type CollectedEntity,
  type CriteriaFieldOperator,
  type EntityAbility,
  type EntityAbilityFields,
  type FullEntityAbility,
  type PathsAndAbilities,
  type UpdatedEntityAttributes,
  type UseCriteria,
  type UseCriteriaAttr,
  type UseCriteriaBase,
  type UseCriteriaField,
  type UseCriteriaKey,
  type UseCriteriaSpecial,
} from "./backendTypes";
import { titleText } from "./textUtils";

const freeAbilities = new Set(["Alchemist's Training"]); // Alchemist's Training is free with Tinker's Training

export const defaultXPCost = (ability: EntityAbility): number => {
  if (
    !ability.custom_fields?.purchase ||
    ability.custom_fields.purchase.includes("sp") ||
    freeAbilities.has(ability.name)
  ) {
    return 0;
  }
  const cost = parseInt(ability.custom_fields.purchase);
  return isNaN(cost) ? 0 : cost;
};

const giftInAbilityExpedited = (
  ability: EntityAbility,
  gift?: CharacterGift
): boolean => {
  return Boolean(
    gift && gift !== "None" && ability.custom_fields?.expedited?.includes(gift)
  );
};

const criteriaFieldOperator = (
  operator: CriteriaFieldOperator
): ((field1: string, field2: string) => boolean) => {
  switch (operator) {
    case "equals":
      return (field1: string, field2: string) => field1 === field2;
    case "gte":
      return (field1: string, field2: string) =>
        parseInt(field1) >= parseInt(field2);
    default:
      return () => false;
  }
};

const abilityPassCriteriaCheckBase = (
  ability: EntityAbility | null,
  criteria: UseCriteriaBase,
  usesAbility: EntityAbility,
  attrs: UpdatedEntityAttributes
): boolean => {
  if (criteria.operator === "every") {
    return criteria.tests.every((test) =>
      abilityPassCriteriaCheck(ability, test, usesAbility, attrs)
    );
  } else if (criteria.operator === "some") {
    return criteria.tests.some((test) =>
      abilityPassCriteriaCheck(ability, test, usesAbility, attrs)
    );
  }
  return false;
};

const abilityPassCriteriaCheckField = (
  ability: EntityAbility | null,
  criteria: UseCriteriaField,
  usesAbility: EntityAbility
): boolean => {
  if (!ability) {
    return true;
  }
  const keys = usesAbility.custom_fields?.keys;
  if (!keys || !keys[criteria.key]) {
    return false;
  }
  // walk down ability to find field referenced by the path
  let field: Record<string, unknown> | string = ability;
  for (const key of criteria.path) {
    if (typeof field !== "object" || !field) {
      break;
    }
    field = field[key] as Record<string, unknown> | string;
  }
  if (typeof field === "string") {
    const comparator = criteriaFieldOperator(criteria.operator);
    return comparator(keys[criteria.key], field);
  }
  return false;
};

const abilityPassCriteriaCheckKey = (
  usesAbility: EntityAbility,
  criteria: UseCriteriaKey
): boolean => {
  const keys = usesAbility.custom_fields?.keys;
  if (keys && keys[criteria.key]) {
    const comparator = criteriaFieldOperator(criteria.operator);
    return comparator(keys[criteria.key], criteria.value);
  }
  return false;
};

const abilityPassCriteriaAttr = (
  criteria: UseCriteriaAttr,
  attrs: UpdatedEntityAttributes
): boolean => {
  const found = attrs[criteria.attr];
  if (!found) {
    return false;
  }
  const comparator = criteriaFieldOperator(criteria.operator);
  return comparator(found.val.toString(), criteria.value);
};

const abilityPassCriteriaIsSpell = (ability: EntityAbility): boolean => {
  const basicSpell =
    ability.custom_fields?.cast_dl || ability.custom_fields?.mp_cost;
  if (basicSpell) {
    return true;
  }
  const path = ability.custom_fields?.path;
  if (path) {
    const magicPath = ["Arcana", "Spellcaster", "Magician", "Wizard"].some(
      (test) => path.includes(test)
    );
    return Boolean(magicPath && ability.custom_fields?.cost?.mp);
  }
  return false;
};

const abilityPassCriteriaCheckSpecial = (
  ability: EntityAbility | null,
  criteria: UseCriteriaSpecial
): boolean => {
  if (!ability) {
    return true;
  }
  switch (criteria.name) {
    case "isSpell":
      return abilityPassCriteriaIsSpell(ability);
    default:
      return false;
  }
};

export const abilityPassCriteriaCheck = (
  ability: EntityAbility | null,
  criteria: UseCriteria,
  usesAbility: EntityAbility,
  attrs: UpdatedEntityAttributes
): boolean => {
  switch (criteria.type) {
    case "base":
      return abilityPassCriteriaCheckBase(
        ability,
        criteria,
        usesAbility,
        attrs
      );
    case "field":
      return abilityPassCriteriaCheckField(ability, criteria, usesAbility);
    case "key":
      return abilityPassCriteriaCheckKey(usesAbility, criteria);
    case "attr":
      return abilityPassCriteriaAttr(criteria, attrs);
    case "special":
      return abilityPassCriteriaCheckSpecial(ability, criteria);
    default:
      return false;
  }
};

const abilityUsesCostAdjust = (
  ability: EntityAbility,
  entity: CollectedEntity,
  attrs: UpdatedEntityAttributes
): number => {
  let totalAdjust = 0;
  entity.abilities
    .filter(
      (usesAbility) =>
        usesAbility.uses?.adjust_ability_cost ||
        usesAbility.uses?.criteria_benefits
    )
    .forEach((usesAbility) => {
      if (usesAbility.uses?.adjust_ability_cost) {
        totalAdjust += usesAbility.uses.adjust_ability_cost.adjust_cost;
      }
      if (usesAbility.uses?.criteria_benefits) {
        const passedCriteria = usesAbility.uses.criteria_benefits.filter(
          (criteria) =>
            criteria.adjust_ability_cost &&
            abilityPassCriteriaCheck(
              ability,
              criteria.criteria,
              usesAbility,
              attrs
            )
        );
        passedCriteria.forEach((criteria) => {
          if (criteria.adjust_ability_cost) {
            totalAdjust += criteria.adjust_ability_cost.adjust_cost;
          }
        });
      }
    });
  return totalAdjust;
};

export const actualXPCost = (
  ability: EntityAbility,
  attrs: UpdatedEntityAttributes,
  entity?: CollectedEntity
): number => {
  let cost = defaultXPCost(ability);
  if (!entity) {
    return cost;
  }
  if (
    giftInAbilityExpedited(ability, entity.entity.other_fields.gift) ||
    giftInAbilityExpedited(ability, entity.entity.other_fields.second_gift)
  ) {
    cost = cost / 2;
  }
  cost += abilityUsesCostAdjust(ability, entity, attrs);
  return cost;
};

export const abilityUsedStats = ["hp", "mp", "vim", "hero"] as const;

export const canUseAbility = (
  ability: EntityAbility,
  attrs: UpdatedEntityAttributes,
  additionalCost?: Partial<AbilityCostMapNumber>
): boolean => {
  const costMap = { ...ability.custom_fields?.cost };
  if (additionalCost) {
    Object.entries(additionalCost).forEach(([attrIn, cost]) => {
      const attr = attrIn as keyof AbilityCostMapNumber;
      const currentCost = costMap[attr];
      if (currentCost) {
        costMap[attr] = cost + currentCost;
      } else {
        costMap[attr] = cost;
      }
    });
  }
  if (
    ability.active ||
    costMap.passive ||
    ability.custom_fields?.activation?.toLowerCase().includes("passive")
  ) {
    return false;
  }
  return abilityUsedStats.every((attr) => {
    const statCurrent = attrs[attr];
    if (statCurrent) {
      const statCost = costMap[attr];
      return !statCost || statCost <= statCurrent.val;
    }
  });
};

export function sortAbilities(
  abilities: FullEntityAbility[]
): FullEntityAbility[] {
  const paths = sortPaths(abilities);
  const abilitiesCopy = abilities.filter(
    (ability) => ability !== undefined && ability.name
  );
  return abilitiesCopy.sort((a1, a2) => {
    // 1. put Passive abilities at the end of the list
    const a1Passive =
      a1.custom_fields?.cost?.passive ||
      a1.custom_fields?.activation?.toLowerCase() === "passive";
    const a2Passive =
      a2.custom_fields?.cost?.passive ||
      a2.custom_fields?.activation?.toLowerCase() === "passive";
    if (!a1Passive && a2Passive) {
      return -1;
    } else if (a1Passive && !a2Passive) {
      return 1;
    }
    // 2. put abilities which use SP instead of XP at the end of the list when passive
    if (
      a1Passive &&
      a1.custom_fields?.purchase &&
      a2Passive &&
      a2.custom_fields?.purchase
    ) {
      const a1SP = a1.custom_fields.purchase.includes("sp");
      const a2SP = a2.custom_fields.purchase.includes("sp");
      if (!a1SP && a2SP) {
        return -1;
      } else if (a1SP && !a2SP) {
        return 1;
      }
    }
    // 3. sort by path gathering
    if (
      a1.custom_fields?.path &&
      a2.custom_fields?.path &&
      a1.custom_fields.path !== a2.custom_fields.path
    ) {
      const pathIdx = (given: string) =>
        paths.findIndex((path) => path === given);
      return pathIdx(a1.custom_fields.path) - pathIdx(a2.custom_fields.path);
    }
    // 4. sort by XP price otherwise (for now at least)
    const costInt = (purchase: string | undefined) => {
      if (purchase === undefined) {
        return 0;
      }
      const cost = parseInt(purchase);
      if (isNaN(cost)) {
        return 0;
      }
      return cost;
    };
    return (
      costInt(a1.custom_fields?.purchase) - costInt(a2.custom_fields?.purchase)
    );
  });
}

// returns a list of paths from the given abilities sorted by paths which contain the least expensive abilities
// eventually we could probably sort based on the req tree which could be parsed in the json object with all abilities
export const sortPaths = (abilities: EntityAbility[]): string[] => {
  const pathCostMap: { [path: string]: number } = {};
  abilities.forEach((ability) => {
    let cost = 5000; // arbitrary amount that costs a lot
    if (ability.custom_fields?.purchase) {
      const purchaseCost = parseInt(ability.custom_fields.purchase);
      if (isNaN(purchaseCost)) {
        cost = purchaseCost;
      }
    }
    if (!ability.name || !ability.custom_fields?.path) {
      return;
    }
    if (ability.custom_fields.path in pathCostMap) {
      pathCostMap[ability.custom_fields.path] = Math.min(
        cost,
        pathCostMap[ability.custom_fields.path]
      );
    } else {
      pathCostMap[ability.custom_fields.path] = cost;
    }
  });
  const paths = Object.keys(pathCostMap);
  paths.sort((p1, p2) => pathCostMap[p1] - pathCostMap[p2]);
  return paths;
};

const abilityUpdatableFields = (
  Object.keys(abilityFieldsNameValidator.Values) as EntityAbilityFields[]
).filter((field) => !["keys", "times_taken"].includes(field));

const diffExistsBetweenAbilityFields = (
  a: EntityAbility,
  b: EntityAbility
): boolean => {
  if (a.name !== b.name) {
    return true;
  }
  if (
    abilityUpdatableFields.some((field) => {
      if (!a.custom_fields && !b.custom_fields) {
        return false;
      }
      const aField = a.custom_fields && a.custom_fields[field];
      const bField = b.custom_fields && b.custom_fields[field];
      return !isEqual(aField, bField);
    })
  ) {
    return true;
  }
  return Boolean((a.uses || b.uses) && !isEqual(a.uses, b.uses));
};

export const findNewAbilityVersion = (
  ability: EntityAbility,
  paths: PathsAndAbilities
): EntityAbility | undefined => {
  const found = paths.abilities.find((search) => search.name === ability.name);
  if (!found) {
    return undefined;
  }
  if (diffExistsBetweenAbilityFields(ability, found)) {
    return {
      ...ability,
      effect: found.effect,
      uses: found.uses,
      custom_fields: { ...found.custom_fields, ...ability.custom_fields },
    };
  }
  return undefined;
};

export const generateAbilityActivation = (cost: AbilityCostMap): string => {
  let activation = "";
  Object.entries(cost).forEach(([costType, amount]) => {
    const titleCostType = titleText(costType);
    const costExtension =
      typeof amount === "boolean"
        ? titleCostType
        : `${amount} ${titleCostType}`;
    activation = activation ? `${activation}, ${costExtension}` : costExtension;
  });
  return activation;
};
