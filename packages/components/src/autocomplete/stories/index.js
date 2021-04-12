/**
 * External dependencies
 */
import { boolean, text } from '@storybook/addon-knobs';

/**
 * WordPress dependencies
 */
import { useState } from '@wordpress/element';
import { RichText } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';

/**
 * Internal dependencies
 */
import Autocomplete from '../';
import './style.css';

export default {
	title: 'Components/Autocomplete',
	component: Autocomplete,
};

const autocompleters = [
	{
		name: 'fruit',
		// The prefix that triggers this completer
		triggerPrefix: '~',
		// The option data
		options: [
			{ visual: '🍎', name: 'Apple', id: 1 },
			{ visual: '🍊', name: 'Orange', id: 2 },
			{ visual: '🍇', name: 'Grapes', id: 3 },
		],
		// Returns a label for an option like "🍊 Orange"
		getOptionLabel: ( option ) => (
			<span>
				<span className="icon">{ option.visual }</span>
				{ option.name }
			</span>
		),
		// Declares that options should be matched by their name
		getOptionKeywords: ( option ) => [ option.name ],
		// Declares that the Grapes option is disabled
		isOptionDisabled: ( option ) => option.name === 'Grapes',
		// Declares completions should be inserted as abbreviations
		getOptionCompletion: ( option ) => (
			<abbr title={ option.name }>{ option.visual }</abbr>
		),

		popoverProps: {
			position: 'bottom left',
		},
	},
];

const RichTextWithAutocompleter = () => {
	const [ value, setValue ] = useState( '' );

	return (
		<RichText
			tagName="h1"
			className="autocompleter-instance"
			value={ value }
			onChange={ setValue }
			placeholder={ __( 'type ~ to get a fruit 🍉🍌🍊' ) }
			autocompleters={ autocompleters }
		/>
	);
};

export const _default = () => {
	const label = text( 'Label', 'Label Text' );
	const hideLabelFromVision = boolean( 'Hide Label From Vision', false );
	const help = text( 'Help Text', 'Help text to explain the input.' );
	const type = text( 'Input Type', 'text' );
	const className = text( 'Class Name', '' );

	return (
		<RichTextWithAutocompleter
			label={ label }
			hideLabelFromVision={ hideLabelFromVision }
			help={ help }
			type={ type }
			className={ className }
		/>
	);
};
