import { ChangeDetectorRef, Component, OnInit, ViewEncapsulation } from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { Comparator, StringFilter } from "@clr/angular";

import { Subject } from 'rxjs/Subject';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { Observable } from 'rxjs/Observable';
import * as _ from 'lodash';

import { NodeService } from 'app/services/rackhd/node.service';
import { Node, NodeType, NODE_TYPE_MAP } from 'app/models';

import { FormControl, FormGroup, FormBuilder, Validators } from '@angular/forms';
import { ObmService } from 'app/services/rackhd/obm.service';
import { SkusService } from 'app/services/rackhd/sku.service';
import { IbmService } from '../services/ibm.service';
import { OBM } from 'app/models';
import { SKU_URL } from 'app/models/sku';
import { AlphabeticalComparator, DateComparator, ObjectFilterByKey, StringOperator,}
  from 'app/utils/inventory-operator';

@Component({
  selector: 'app-nodes',
  templateUrl: './nodes.component.html',
  styleUrls: ['./nodes.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class NodesComponent implements OnInit {
  nodeStore: Node[] = [];
  allNodes: Node[] = [];

  nodeTypes: NodeType[];
  nodesTypeCountMatrix = {};

  selectedType: string;
  selectedSku: string;
  selectedNode: Node;
  selectedNodes: Node[];
  isShowDetail: boolean;

  isShowObmDetail: boolean;
  selectedObms: OBM[];

  isShowIbmDetail: boolean;
  selectedIbms: OBM[];

  isShowSkuDetail: boolean;
  skuDetail: any;

  isCreateNode: boolean;
  isDelete: boolean;
  nodeForm: FormGroup;

  selectableNodeTypes: string[];

  dgDataLoading = false;
  dgPlaceholder = 'No nodes found!'

  public nameComparator = new AlphabeticalComparator('name');
  public idComparator = new AlphabeticalComparator('id');
  public typeComparator = new AlphabeticalComparator('type');
  public skuComparator = new AlphabeticalComparator('sku');
  public autoDiscoverComparator = new AlphabeticalComparator('autoDiscover');
  public identifiersComparator = new AlphabeticalComparator('identifiers');
  public discoveredTimeComparator = new DateComparator('discoveredTime');
  public typeFilter = new ObjectFilterByKey('type');
  public skuFilter = new ObjectFilterByKey('sku');
  typeFilterValue: string = this.selectedType;
  // skuFilterValue: string = this.selectedSku;

  shapeMap = {
    'compute': 'computer',
    'storage': 'data-cluster',
    'network': 'network-switch'
  }

  constructor(public activatedRoute: ActivatedRoute,
    public router: Router,
    public nodeService: NodeService,
    public obmService: ObmService,
    public ibmService: IbmService,
    public skuService: SkusService,
    private fb: FormBuilder) {
  }

  ngOnInit() {
    let self = this;
    this.selectableNodeTypes = _.values(NODE_TYPE_MAP);
    this.nodeService.getNodeTypes().subscribe(
      data => {
        this.nodeTypes = _.transform(
          data,
          function (result, item) {
            let dt = new NodeType();
            if (_.has(NODE_TYPE_MAP, item)) {
              dt.identifier = item;
              dt.displayName = NODE_TYPE_MAP[item];
              result.push(dt);
            }
          }, []);
      }
    );
    this.selectedNodes = [];
    this.getAllNodes();
    this.createForm();
  }

  afterGetNodes() {
    this.nodesTypeCountMatrix = _.transform(this.nodeStore, (result, item) => {
      let type = item.type;
      if (!_.has(NODE_TYPE_MAP, type)) {
        type = 'other';
      }
      result[type] ? result[type] += 1 : result[type] = 1;
    }, []);
  }

  getAllNodes(): void {
    this.nodeService.getAll()
      .subscribe(data => {
        this.nodeStore = data;
        this.allNodes = data;
        this.dgDataLoading = false;
        this.afterGetNodes();
      });
  }

  create(): void {
    this.isCreateNode = true;
  }

  batchDelete(node?: Node): void {
    if (!_.isEmpty(this.selectedNodes)) {
      this.isDelete = true;
    }
  }

  willDelete(node: Node): void {
    this.selectedNodes = [node];
    this.isDelete = true;
  }

  refresh() {
    this.dgDataLoading = true;
    this.getAllNodes();
  }

  createForm() {
    this.nodeForm = this.fb.group({
      name: '',
      type: '',
      autoDiscover: '',
      otherConfig: '',
    });
  }

  createNode(): void {
    let value = this.nodeForm.value;
    let jsonData = value['otherConfig'] ? JSON.parse(value['otherConfig']) : {};

    // data transform
    jsonData['name'] = value['name'];
    jsonData['type'] = value['type'];
    jsonData['autoDiscover'] = value['autoDiscover'] === 'true' ? true : false;

    // let postData = JSON.stringify(jsonData);
    this.nodeService.post(jsonData)
      .subscribe(data => {
        this.refresh();
      });
  }

  delete(): void {
    let list = [];
    _.forEach(this.selectedNodes, node => {
      list.push(node.id);
    });

    this.nodeService.deleteByIdentifiers(list)
    .subscribe(results =>{
      this.refresh();
    });
  }

  onAction(action){
    switch(action) {
      case 'Refresh':
        this.refresh();
        break;
      case 'Create':
        this.create();
        break;
      case 'Delete':
        this.batchDelete();
        break;
    };
  }

  onFilter(filtered) {
    this.nodeStore = filtered;
    this.afterGetNodes();
  }

  selectType(type: NodeType) {
    if (this.selectedType === type.displayName) {
      this.selectedType = '';
    } else {
      this.selectedType = type.displayName;
    }
    this.typeFilterValue = this.selectedType;
  }

  goToDetail(node: Node) {
    this.selectedNode = node;
    this.isShowDetail = true;
  }

  goToShowObmDetail(node: Node) {
    this.selectedNode = node;
    this.selectedObms = [];
    for (let entry of node.obms) {
      let obmId = entry['ref'].split('/').pop();
      this.getObmById(obmId);
    }
    this.isShowObmDetail = true;
  }

  goToShowIbmDetail(node: Node) {
    this.selectedNode = node;
    this.selectedObms = [];
    for (let entry of node.ibms) {
      let ibmId = entry['ref'].split('/').pop();
      this.getIbmById(ibmId);
    }
    this.isShowIbmDetail = true;
  }

  goToShowSkuDetail(node: Node) {
    this.selectedNode = node;
    let skuId = node.sku ? node.sku.split('/')[4] : '';
    if (skuId) {
      this.skuService.getByIdentifier(skuId)
        .subscribe(data => {
          this.skuDetail = data;
          this.isShowSkuDetail = true;
        });
    } else {
      this.skuDetail = [];
      this.isShowSkuDetail = true;
    }
  }

  getObmById(identifier: string): void {
    this.obmService.getByIdentifier(identifier)
      .subscribe(data => {
        this.selectedObms.push(data);
      });
  }

  getIbmById(identifier: string): void {
    this.ibmService.getByIdentifier(identifier)
      .subscribe(data => {
        this.selectedIbms.push(data);
      });
  }
}
