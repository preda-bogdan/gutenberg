/**
 * External dependencies
 */
import { omit, isEqual } from 'lodash';

/**
 * WordPress dependencies
 */
import { serialize, parse, createBlock } from '@wordpress/blocks';
import { useState, useEffect, useCallback } from '@wordpress/element';
import isShallowEqual from '@wordpress/is-shallow-equal';

function addWidgetIdToBlock( block, widgetId ) {
	return {
		...block,
		attributes: {
			...( block.attributes || {} ),
			__internalWidgetId: widgetId,
		},
	};
}

function getWidgetId( block ) {
	return block.attributes.__internalWidgetId;
}

function blockToWidget( block, existingWidget = null ) {
	let widget;

	if ( block.name === 'core/legacy-widget' ) {
		const isReferenceWidget = !! block.attributes.referenceWidgetName;
		if ( isReferenceWidget ) {
			widget = {
				id: block.attributes.referenceWidgetName,
				instance: block.attributes.instance,
			};
		} else {
			widget = {
				widgetClass: block.attributes.widgetClass,
				idBase: block.attributes.idBase,
				instance: block.attributes.instance,
			};
		}
	} else {
		const instance = {
			content: serialize( block ),
		};
		widget = {
			idBase: 'block',
			widgetClass: 'WP_Widget_Block',
			instance: {
				...instance,
				__unstable_instance: instance,
			},
		};
	}

	return {
		...omit( existingWidget, [ 'form', 'rendered' ] ),
		...widget,
	};
}

function widgetToBlock( widget ) {
	let block;

	if ( widget.idBase === 'block' ) {
		const parsedBlocks = parse(
			widget.instance.__unstable_instance.content
		);
		block = parsedBlocks.length
			? parsedBlocks[ 0 ]
			: createBlock( 'core/paragraph', {} );
	} else {
		const attributes = {
			name: widget.name,
			form: widget.form,
			instance: widget.instance,
			idBase: widget.idBase,
			number: widget.number,
		};

		const isReferenceWidget = ! widget.widgetClass;
		if ( isReferenceWidget ) {
			attributes.referenceWidgetName = widget.id;
		} else {
			attributes.widgetClass = widget.widgetClass;
		}

		block = createBlock( 'core/legacy-widget', attributes, [] );
	}

	return addWidgetIdToBlock( block, widget.id );
}

function widgetsToBlocks( widgets ) {
	return widgets.map( ( widget ) => widgetToBlock( widget ) );
}

export default function useSidebarBlockEditor( sidebar ) {
	const [ blocks, setBlocks ] = useState( () =>
		widgetsToBlocks( sidebar.getWidgets() )
	);

	useEffect( () => {
		return sidebar.subscribe( ( prevWidgets, nextWidgets ) => {
			setBlocks( ( prevBlocks ) => {
				const prevWidgetsMap = new Map(
					prevWidgets.map( ( widget ) => [ widget.id, widget ] )
				);
				const prevBlocksMap = new Map(
					prevBlocks.map( ( block ) => [
						getWidgetId( block ),
						block,
					] )
				);

				const nextBlocks = nextWidgets.map( ( nextWidget ) => {
					const prevWidget = prevWidgetsMap.get( nextWidget.id );

					// Bail out updates.
					if ( prevWidget && prevWidget === nextWidget ) {
						return prevBlocksMap.get( nextWidget.id );
					}

					return widgetToBlock( nextWidget );
				} );

				// Bail out updates.
				if ( isShallowEqual( prevBlocks, nextBlocks ) ) {
					return prevBlocks;
				}

				return nextBlocks;
			} );
		} );
	}, [ sidebar ] );

	const onChangeBlocks = useCallback(
		( nextBlocks ) => {
			setBlocks( ( prevBlocks ) => {
				if ( isShallowEqual( prevBlocks, nextBlocks ) ) {
					return prevBlocks;
				}

				const prevBlocksMap = new Map(
					prevBlocks.map( ( block ) => [
						getWidgetId( block ),
						block,
					] )
				);

				const nextWidgets = nextBlocks.map( ( nextBlock ) => {
					const widgetId = getWidgetId( nextBlock );

					// Update existing widgets.
					if ( widgetId && prevBlocksMap.has( widgetId ) ) {
						const prevBlock = prevBlocksMap.get( widgetId );
						const prevWidget = sidebar.getWidget( widgetId );

						// Bail out updates by returning the previous widgets.
						// Deep equality is necessary until the block editor's internals changes.
						if ( isEqual( nextBlock, prevBlock ) ) {
							return prevWidget;
						}

						return blockToWidget( nextBlock, prevWidget );
					}

					// Add a new widget.
					return blockToWidget( nextBlock );
				} );

				const addedWidgetIds = sidebar.setWidgets( nextWidgets );

				if (
					addedWidgetIds.filter( ( widgetId ) => widgetId !== null )
						.length
				) {
					return nextBlocks.map( ( nextBlock, index ) => {
						const addedWidgetId = addedWidgetIds[ index ];

						if ( addedWidgetId !== null ) {
							return addWidgetIdToBlock(
								nextBlock,
								addedWidgetId
							);
						}

						return nextBlock;
					} );
				}

				return nextBlocks;
			} );
		},
		[ sidebar ]
	);

	return [ blocks, onChangeBlocks, onChangeBlocks ];
}
