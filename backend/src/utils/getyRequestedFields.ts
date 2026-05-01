import { GraphQLResolveInfo, FieldNode, SelectionNode } from 'graphql';
import property from '../graphql/resolvers/property.js';

/**
 * Recursively extracts field names from the GraphQLResolveInfo object.
 * Useful for dynamically building SQL/ORM queries based on requested fields.
 *
 * @param info - The resolver info argument passed to your resolver.
 * @param parentName - Optionally specify a nested field to extract.
 * @returns A list of requested field names.
 */
const EXCLUDED = new Set(['address', 'realtor', 'images', '__typename']);
export function getRequestedFieldss(
  info: GraphQLResolveInfo,
  parentName?: string
): string[] {
  const fieldNodes = info.fieldNodes;

  // Helper function to recursively collect field names
  function collectFields(
    selections: readonly SelectionNode[],
    path: string[] = []
  ): string[] {
    const fields: string[] = [];

    for (const selection of selections) {
      if (selection.kind === 'Field') {
        const name = selection.name.value;
        const currentPath = [...path, name];
        fields.push(currentPath.join('.'));

        if (selection.selectionSet) {
          fields.push(
            ...collectFields(selection.selectionSet.selections, currentPath)
          );
        }
      } else if (selection.kind === 'InlineFragment' && selection.selectionSet) {
        fields.push(...collectFields(selection.selectionSet.selections, path));
      }
    }

    return fields;
  }

  let allFields = fieldNodes.flatMap((node: FieldNode) => {
    return node.selectionSet
      ? collectFields(node.selectionSet.selections)
      : [];
  });

  // console.log({allFields})

  // Optionally strip prefix like "edges.node"
  if (true) {
    const prefix = 'edges.nodes' + '.';
    allFields = allFields
      .filter((f) => f.startsWith('edges.node.'))
      .map((f) => f.replace('edges.node.', ''));
  }

  return Array.from(new Set(allFields)); // remove duplicates
}


export function getRequestedFields(info: any): string[] {
  const selections = info.fieldNodes[0].selectionSet?.selections || [];
  const fields: string[] = [];
  selections.forEach((selection: any) => {
    if (selection.name.value === 'address') { 
      const addressFields = selection.selectionSet?.selections.map((s: any) => `address.${s.name.value}`) || [];
      fields.push('address', ...addressFields);
    } else if (selection.name.value === 'property') {
      const propertyFields: string[] = selection.selectionSet?.selections.map((s: any) => {
        if (EXCLUDED.has(s.name.value.toLowerCase())) return '';
        return `p.${s.name.value}`
      }) || [];
      fields.push('property', ...propertyFields);
    } else if (selection.name.value === 'featured') {
      selection.selectionSet?.selections.map((s: any) => {
        if (s.name.value === 'property') {
          const propertyFields: string[] = s.selectionSet?.selections.map((s: any) => {
            if (EXCLUDED.has(s.name.value.toLowerCase())) return '';
            return `p.${s.name.value}`
          }) || [];
          fields.push(...propertyFields);
        }
      })
    } else {
      fields.push(selection.name.value);
    }
  });
  return fields;
}

export function getNestedRequestedFields(info: any): string[] {
  const selections = info.fieldNodes[0].selectionSet?.selections.find(ele => ele.name.value === 'edges').selectionSet?.selections.find(ele => ele.name.value === 'node').selectionSet.selections || [];
  // console.log({osiwo: info.fieldNodes[0].selectionSet?.selections.find(ele => ele.name.value === 'edges').selectionSet?.selections.find(ele => ele.name.value === 'node')})
  const fields: string[] = [];
  selections.forEach((selection: any) => {
    // console.log(selection)
    if (selection.name.value === 'address') { 
      const addressFields = selection.selectionSet?.selections.map((s: any) => `address.${s.name.value}`) || [];
      fields.push('address', ...addressFields);
    } else if (selection.name.value === 'property') {
      const propertyFields: string[] = selection.selectionSet?.selections.map((s: any) => {
        if (EXCLUDED.has(s.name.value.toLowerCase())) return '';
        return `p.${s.name.value}`
      }) || [];
      fields.push('property', ...propertyFields);
    } else {
      fields.push(selection.name.value);
    }
  });
  return fields;
}