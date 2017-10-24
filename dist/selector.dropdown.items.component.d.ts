/// <reference types="angular" />
import { ISelector } from './interfaces';
export declare class SelectorDropdownItemsComponent {
    link: (scope: ISelector.DropdownItemsComponent.Scope, element: angular.IAugmentedJQuery, attrs: angular.IAttributes) => void;
    replace: boolean;
    restrict: string;
    templateUrl: string;
    scope: ISelector.DropdownItemsComponent.Scope | any;
    private PARENT_REFS;
    private getGroupTpl(option, index, filteredOptions);
    private getItemTpl(option, index, filteredOptions, highlighted);
    constructor($log: angular.ILogService);
    static Factory(): ($log: any) => SelectorDropdownItemsComponent;
}