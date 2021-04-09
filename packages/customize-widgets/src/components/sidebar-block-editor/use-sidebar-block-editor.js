/**
 * External dependencies
 */
import { omit, keyBy } from 'lodash';

/**
 * WordPress dependencies
 */
import { serialize, parse, createBlock } from '@wordpress/blocks';
import { useState, useEffect, useCallback, useRef } from '@wordpress/element';
import { select } from '@wordpress/data';
import { store as blockEditorStore } from '@wordpress/block-editor';

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

function initState( sidebar ) {
	const state = [];

	for ( const widgetId of sidebar.getWidgetIds() ) {
		const widget = sidebar.getWidget( widgetId );
		const block = widgetToBlock( widget );
		state.push( block );
	}

	return state;
}

export default function useSidebarBlockEditor( sidebar ) {
	const [ blocks, setBlocks ] = useState( () => initState( sidebar ) );

	const ignoreIncoming = useRef( false );

	// Get the blocks from the store and save it back to component's states once mounted.
	// This is necessary since that after the first onChangeBlocks fired,
	// all the blocks in the callback are transformed once via getBlocks internally.
	// In order to only perform referential equality check in the callback,
	// we have to make sure the references are the same between state and store.
	useEffect( () => {
		const storedBlocks = select( blockEditorStore ).getBlocks( null );

		setBlocks( storedBlocks );
	}, [] );

	useEffect( () => {
		const handler = ( event ) => {
			if ( ignoreIncoming.current ) {
				return;
			}

			switch ( event.type ) {
				case 'widgetAdded': {
					const { widgetId } = event;
					const block = blockToWidget(
						sidebar.getWidget( widgetId )
					);
					setBlocks( ( prevBlocks ) => [ ...prevBlocks, block ] );
					break;
				}

				case 'widgetRemoved': {
					const { widgetId } = event;
					setBlocks( ( prevBlocks ) =>
						prevBlocks.filter(
							( block ) => getWidgetId( block ) === widgetId
						)
					);
					break;
				}

				case 'widgetChanged': {
					const { widgetId } = event;
					const blockToUpdate = blocks.find(
						( block ) => getWidgetId( block ) === widgetId
					);
					const updatedBlock = widgetToBlock(
						sidebar.getWidget( widgetId ),
						blockToUpdate
					);
					setBlocks( ( prevBlocks ) =>
						prevBlocks.map( ( block ) =>
							block === blockToUpdate ? updatedBlock : block
						)
					);
					break;
				}

				case 'widgetsReordered':
					const { widgetIds } = event;

					setBlocks( ( prevBlocks ) => {
						const blocksByWidgetId = keyBy(
							prevBlocks,
							getWidgetId
						);

						return widgetIds.map(
							( widgetId ) => blocksByWidgetId[ widgetId ]
						);
					} );
					break;
			}
		};

		return sidebar.subscribe( handler );
	}, [ sidebar ] );

	const onChangeBlocks = useCallback(
		( _nextBlocks ) => {
			ignoreIncoming.current = true;

			setBlocks( ( prevBlocks ) => {
				const prevBlocksMap = new Map(
					prevBlocks.map( ( block ) => [
						getWidgetId( block ),
						block,
					] )
				);

				let nextBlocks = _nextBlocks;

				nextBlocks.forEach( ( nextBlock, index ) => {
					let widgetId = getWidgetId( nextBlock );

					if ( widgetId && prevBlocksMap.has( widgetId ) ) {
						// Update existing widgets.
						const prevBlock = prevBlocksMap.get( widgetId );

						// We can do referential equality check rather than isEqual here
						// because the block editor store makes sure to cache the blocks for us.
						if ( nextBlock !== prevBlock ) {
							const widgetToUpdate = sidebar.getWidget(
								widgetId
							);
							const widget = blockToWidget(
								nextBlock,
								widgetToUpdate
							);
							sidebar.updateWidget( widget );
						}
					} else {
						// Add a new widget.
						const widget = blockToWidget( nextBlock );
						widgetId = sidebar.addWidget( widget, index );

						// Only create a new instance of nextBlocks when there's a new widget.
						// This is to prevent useBlockSync from incorrectly marking changes as persistent.
						if ( nextBlocks === _nextBlocks ) {
							nextBlocks = [ ..._nextBlocks ];
						}

						nextBlocks[ index ] = {
							...nextBlock,
							attributes: {
								...nextBlock.attributes,
								__internalWidgetId: widgetId,
							},
						};
					}
				} );

				const nextBlocksWidgetIds = new Set(
					nextBlocks.map( getWidgetId )
				);

				// Remove deleted widgets.
				prevBlocks.map( getWidgetId ).forEach( ( widgetId ) => {
					if ( ! nextBlocksWidgetIds.has( widgetId ) ) {
						sidebar.removeWidget( widgetId );
					}
				} );

				// Reset order.
				// Backbone API should make sure to bail out the updates if the value is deeply equal.
				sidebar.setWidgetIds( Array.from( nextBlocksWidgetIds ) );

				ignoreIncoming.current = false;

				return nextBlocks;
			} );
		},
		[ sidebar ]
	);

	return [ blocks, onChangeBlocks, onChangeBlocks ];
}
